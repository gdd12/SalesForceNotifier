const { exec } = require('child_process');
const { logger, DEBUG, ERROR } = require("./logger");
const { httpRequest } = require("./http");
const { readConfigurationFile, readCredentials, readQueueStatus, writeCaseListFile } = require("./readFiles");
const { validateConfiguration, validateCredentials, validateQueues, validateProducts } = require('./validation');

const srcPath = process.env.NODE_PATH;
const configurationFilePath = `${srcPath}/config/configuration.xml`;
const credentialFilePath = `${srcPath}/config/credentials.txt`;
const queueStatusFile = `${srcPath}/config/queues.xml`;
const caseNumberFile = `${srcPath}/config/caseNumbers`;

const Notifier = `python3 ${srcPath}/NotificationService/Notification.py`;

const configurationTypes = {
  mainQueue: 'request_info',
  myQueue: 'personal_queue',
  products: 'products_list'
};

const productCaseCount = {
  B2B: 0,
  Activator: 0,
  SecureTransport: 0,
  Cft: 0,
  Api: 0,
  Gateway: 0,
  Sentinel: 0
};

const statusCodeMapping = {
  200: "Success",
  400: "Bad Request",
  401: "Unauthorized",
  404: "Not Found",
  500: "Server Error"
};

const RunValidations = async () => {
  const func = "RunValidations";
  try {
    DEBUG(func, `Starting configuration and credentials validation process`);
    await validateConfiguration(configurationFilePath);
    await validateCredentials(credentialFilePath);
    await validateProducts(configurationFilePath);
    await validateQueues(queueStatusFile);
    DEBUG(func, `Validations successful, proceeding to TriggerStartup`);
    TriggerStartup();
  } catch (error) {
    ERROR(func, `Validation failed: ${error.message}`);
    process.exit(2);
  }
};

const TriggerStartup = async () => {
  const func = "TriggerStartup";
  let phxConfiguration, myConfiguration;
  try {
    DEBUG(func, `Invoking queuesToCheck function to determine which queues to process`);
    const queueShouldBeChecked = await queuesToCheck();
    DEBUG(func, `Reading credentials from file: ${credentialFilePath}`);
    const credentials = await readCredentials(credentialFilePath);
    DEBUG(func, `Queue settings: teamQueue - ${JSON.parse(queueShouldBeChecked.teamQueue)}, myQueue - ${JSON.parse(queueShouldBeChecked.myQueue)}`);

    if (JSON.parse(queueShouldBeChecked.teamQueue)) {
      DEBUG(func, `Reading configuration for mainQueue (teamQueue)`);
      phxConfiguration = await readConfigurationFile({ type: configurationTypes.mainQueue, filePath: configurationFilePath });
    }
    
    if (JSON.parse(queueShouldBeChecked.myQueue)) {
      DEBUG(func, `Reading configuration for personalQueue (myQueue)`);
      myConfiguration = await readConfigurationFile({ type: configurationTypes.myQueue, filePath: configurationFilePath });
      DEBUG(func, `Successfully read configuration for myQueue`);
    }

    if (JSON.parse(queueShouldBeChecked.teamQueue) && phxConfiguration.url && phxConfiguration.message && phxConfiguration.context && phxConfiguration.pageUri) {
      DEBUG(func, `Sending HTTP request for teamQueue (phxConfiguration)`);
      const phxQueueResponse = await httpRequest({ requestConfig: phxConfiguration, credentials: credentials });
      if (phxQueueResponse && phxQueueResponse.status === 200) {
        DEBUG(func, `Received 200 OK response from HTTP handler for phxQueue`);
        processPhxHttpResponse(phxQueueResponse);
      } else {
        DEBUG(func, `Received ${phxQueueResponse.status} response for phxQueue`);
        handleFailedResponse(phxQueueResponse.status);
      }
    }

    if (JSON.parse(queueShouldBeChecked.myQueue) && myConfiguration.url && myConfiguration.message && myConfiguration.context && myConfiguration.pageUri) {
      DEBUG(func, `Sending HTTP request for myQueue (myConfiguration)`);
      const myQueueResponse = await httpRequest({ requestConfig: myConfiguration, credentials: credentials });
      if (myQueueResponse && myQueueResponse.status === 200) {
        DEBUG(func, `Received 200 OK response from HTTP handler for myQueue`);
        processMyHttpResponse(myQueueResponse);
      } else {
        DEBUG(func, `Received ${myQueueResponse.status} response for myQueue`);
        handleFailedResponse(myQueueResponse.status);
      }
    }
  } catch (error) {
    ERROR(func, `Error during TriggerStartup: ${error.message}`);
    process.exit(2);
  }
};

const queuesToCheck = async () => {
  const func = "queuesToCheck";
  try {
    DEBUG(func, `Fetching queue status from file: ${queueStatusFile}`);
    const queueState = await readQueueStatus(queueStatusFile);
    const teamQueue = queueState.Queues.Team[0];
    const myQueue = queueState.Queues.Personal[0];
    DEBUG(func, `Queues to be checked: teamQueue - ${teamQueue}, myQueue - ${myQueue}`);
    return { teamQueue, myQueue };
  } catch (error) {
    ERROR(func, `Error reading queue status: ${error.message}`);
    process.exit(2);
  }
};

const processPhxHttpResponse = async (queueData) => {
  const func = "processPhxHttpResponse";
  try {
    DEBUG(func, `Processing HTTP response data for phxQueue`);
    let baseCaseRecord = queueData?.data?.context;
    let caseRecords = baseCaseRecord.globalValueProviders[1]?.values?.records || baseCaseRecord.globalValueProviders[2]?.values?.records;
    let caseNumbers = [];
    if (!caseRecords) {
      logger.error(`Case records are missing or malformed. Check configuration file ${configurationFilePath}`);
      process.exit(2);
    }

    DEBUG(func, `Reading supported products for filtering cases`);
    const supportedProduct = await readConfigurationFile({ type: configurationTypes.products, filePath: configurationFilePath });

    DEBUG(func, `Matching case records with supported products`);
    for (let key in supportedProduct) {
      if (supportedProduct[key][0]) {
        Object.keys(caseRecords).forEach((recordKey) => {
          let productDisplayValue = caseRecords[recordKey].Case.record.fields.Product__r.displayValue;
          if (productDisplayValue && productDisplayValue.toLowerCase().includes(key.toLowerCase()) && !productDisplayValue.toLowerCase().includes('cloud')) {
            if (productCaseCount.hasOwnProperty(key)) {
              productCaseCount[key] += 1;
              caseNumbers.push(caseRecords[recordKey].Case.record.fields.CaseNumber.value);
            }
          }
        });
      }
    }

    DEBUG(func, `Printing case counts for supported products`);
    printCasesInConsole(productCaseCount, supportedProduct);

    DEBUG(func, `Printing queue information for mainQueue`);
    printQueueInfo({ cases: productCaseCount, queue: configurationTypes.mainQueue });

    DEBUG(func, `Writing case numbers to file: ${caseNumberFile}`);
    writeCaseListFile(caseNumbers, caseNumberFile);
  } catch (error) {
    ERROR(func, `Error processing HTTP response for phxQueue: ${error.message}`);
    handleFailedResponse(error, 'in processPhxHttpResponse');
  }
};

const processMyHttpResponse = async (queueData) => {
  const func = "processMyHttpResponse";
  try {
    DEBUG(func, `Processing HTTP response data for myQueue`);
    const CaseCommitments = [];
    let baseCaseRecord = queueData?.data?.context;
    let myCases = baseCaseRecord.globalValueProviders[1]?.values?.records || baseCaseRecord.globalValueProviders[2]?.values?.records;
    if (!myCases) {
      logger.error(`Case records are missing or malformed. Check configuration file ${configurationFilePath}`);
      process.exit(2);
    }

    DEBUG(func, `Extracting case commitment data`);
    Object.values(myCases).forEach((record) => {
      let field = record.Case.record.fields;
      CaseCommitments.push({ CaseNumber: field.CaseNumber.value, Countdown: field.Time_Before_Next_Update_Commitment__c.value, Status: field.Status.value });
    });

    DEBUG(func, `Displaying personal queue information`);
    printQueueInfo({ cases: CaseCommitments, queue: configurationTypes.myQueue });
  } catch (error) {
    ERROR(func, `Error processing HTTP response for myQueue: ${error.message}`);
    handleFailedResponse(error, 'in processMyHttpResponse');
  }
};

const handleFailedResponse = (err, context = '') => {
  const func = "handleFailedResponse";
  logger.error(`Error ${err} ${statusCodeMapping[err]}`);
  DEBUG(func, `Handling HTTP error with status code ${err}`);
  if (err == 400) {
    DEBUG(func, `Unrecoverable error: HTTP 400 - Bad Request. Exiting...`);
    process.exit(2);
  }
  if (err == 401) {
    DEBUG(func, `Recoverable error: HTTP 401 - Unauthorized. Possible token issue. Exiting...`);
    process.exit(1);
  }
  if (err == 404) {
    DEBUG(func, `Unrecoverable error: HTTP 404 - Not Found. Exiting...`);
    process.exit(2);
  } else {
    DEBUG(func, `Unknown error code, exiting with failure`);
    process.exit(2);
  }
};

const printCasesInConsole = async (cases, supportedProduct) => {
  const func = "printCasesInConsole";
  let newCases = false;
  DEBUG(func, `Looping through the cases and counting them per product type`);
  Object.keys(cases).forEach(product => {
    DEBUG(func, `Displaying the case count for ${product}: ${cases[product]} cases`);
    if (supportedProduct[product][0] && cases[product] > 0) {
      logger.info(`  ${cases[product]} ${product} case(s)`);
      newCases = true;
    }
  });
  if (!newCases) {
    DEBUG(func, `No new cases matching supported products`);
    console.log('  No cases in the queue');
  }
};

const printQueueInfo = ({ cases, queue }) => {
  const func = "printQueueInfo"
  if (queue === configurationTypes.myQueue) {
    let commitmentNeeded = 0;
    let inSupportCase = 0;
    let newCase = 0;
    Object.values(cases).forEach((record) => {
      if (record.Countdown < 1) commitmentNeeded += 1;
      if (record.Status.toLowerCase().includes('support')) inSupportCase += 1;
      if (record.Status.toLowerCase().includes('new')) newCase += 1;
    });
    
    if (commitmentNeeded || inSupportCase || newCase) {
      logger.info()
      DEBUG(func, `Displaying case statuses in the console`);
      if (commitmentNeeded > 0) logger.warn(`  ${commitmentNeeded} case(s) need an update within 24 hours`);
      if (inSupportCase > 0) logger.warn(`  ${inSupportCase} case(s) are In Support`);
      if (newCase > 0) logger.warn(`  ${newCase} case(s) are new and need an IC`);
    } else {
      DEBUG(func, `No case updates necessary`);
      console.log(`  No case updates`);
    }
  }
  if (queue === configurationTypes.mainQueue) {
    DEBUG(func, `Preparing to execute driver for mainQueue`);
    const { B2B, Activator, SecureTransport, Cft, Api, Gateway, Sentinel } = cases;
    const driver = B2B || Activator || SecureTransport || Cft || Api || Gateway || Sentinel > 0 
      ? Notifier + ` ${B2B} ${Activator} ${SecureTransport} ${Cft} ${Api} ${Gateway} ${Sentinel}`
      : null;

    DEBUG(func, `Selected driver: "${driver}"`);
    if (driver) {
      exec(driver, (error) => {
        if (error) {
          DEBUG(func, `Error occurred while executing the driver: ${error}`);
          logger.error(`Error executing Python script: ${error}`);
        } else {
          DEBUG(func, `Driver executed successfully`);
        }
      });
    } else {
      DEBUG(func, `No driver exists, continuing to next steps`)
    }
  }
};

RunValidations();