const { logger, DEBUG, ERROR } = require("./logger")
const { httpRequest } = require("./http")
const { readConfigurationFile, readCredentials, readQueueStatus, writeCaseListFile } = require("./readFiles")
const { validateConfiguration, validateCredentials, validateQueues, validateProducts } = require('./validation')

const srcPath = process.env.NODE_PATH
const configurationFilePath = `${srcPath}/config/configuration.xml`;
const credentialFilePath = `${srcPath}/config/credentials.txt`;
const queueStatusFile = `${srcPath}/config/queues.xml`
const caseNumberFile = `${srcPath}/config/caseNumbers`

const configurationTypes = {
  mainQueue: 'request_info',
  myQueue: 'personal_queue',
  products: 'products_list'
}

const productCaseCount = {
  B2B: 0,
  Activator: 0,
  SecureTransport: 0,
  Cft: 0,
  Api: 0,
  Gateway: 0
};

const statusCodeMapping = {
  200: "Success",
  400: "Bad Request",
  401: "Unauthorized",
  404: "Not Found",
  500: "Server Error"
}

const RunValidations = async () => {
  const func = "RunValidations"
  try {
    DEBUG(func, `Starting configuration validation process`);
    await validateConfiguration(configurationFilePath)
    await validateCredentials(credentialFilePath)
    await validateProducts(configurationFilePath)
    await validateQueues(queueStatusFile)
    // Once validations are complete, run the Trigger script
    DEBUG(`Validation`, `************************* Validation Checks Completed *************************`)
    DEBUG(func, `Validation complete, triggering startup sequence.`);
    TriggerStartup()
  } catch (error) {
    ERROR(func, `Error during validation process: ${error.message}`);
    process.exit(2)
  }
};

const TriggerStartup = async () => {
  const func = "TriggerStartup"
  let phxConfiguration, myConfiguration;
  try {
    DEBUG(func, `Initiating queue check process.`);
    const queueShouldBeChecked = await queuesToCheck();
    DEBUG(func, `Retrieving credentials from: ${credentialFilePath}`);
    const credentials = await readCredentials(credentialFilePath);

    DEBUG(func, `Checking teamQueue flag: ${JSON.parse(queueShouldBeChecked.teamQueue)}`);
    if (JSON.parse(queueShouldBeChecked.teamQueue)) {
      phxConfiguration = await readConfigurationFile({ type: configurationTypes.mainQueue, filePath: configurationFilePath });
    }

    DEBUG(func, `Checking myQueue flag: ${JSON.parse(queueShouldBeChecked.myQueue)}`);
    if (JSON.parse(queueShouldBeChecked.myQueue)) {
      myConfiguration = await readConfigurationFile({ type: configurationTypes.myQueue, filePath: configurationFilePath });
      DEBUG(func, `Successfully read configuration for ${configurationTypes.myQueue}`);
    }

    if (JSON.parse(queueShouldBeChecked.teamQueue) && phxConfiguration.url && phxConfiguration.message && phxConfiguration.context && phxConfiguration.pageUri) {
      DEBUG(func, `Sending HTTP request for teamQueue configuration`);
      const phxQueueResponse = await httpRequest({ requestConfig: phxConfiguration, credentials });
      handleQueueResponse(func, phxQueueResponse, 'teamQueue');
    }

    if (JSON.parse(queueShouldBeChecked.myQueue) && myConfiguration.url && myConfiguration.message && myConfiguration.context && myConfiguration.pageUri) {
      DEBUG(func, `Sending HTTP request for myQueue configuration`);
      const myQueueResponse = await httpRequest({ requestConfig: myConfiguration, credentials });
      handleQueueResponse(func, myQueueResponse, 'myQueue');
    }
  } catch (error) {
    ERROR(func, `Error during startup trigger: ${error.message}`);
    process.exit(2)
  }
};

const handleQueueResponse = (func, response, queueType) => {
  if (response && response.status === 200) {
    DEBUG(func, `HTTP response for ${queueType} received with status 200`);
    DEBUG(func, `Processing response data for ${queueType}`);
    queueType === 'teamQueue' ? processPhxHttpResponse(response) : processMyHttpResponse(response);
  } else {
    DEBUG(func, `HTTP response for ${queueType} returned with status ${response.status}`);
    handleFailedResponse(response.status);
  }
};

const queuesToCheck = async () => {
  const func = "queuesToCheck"
  try {
    DEBUG(func, `Retrieving queue status from: ${queueStatusFile}`);
    const queueState = await readQueueStatus(queueStatusFile);
    const teamQueue = queueState.Queues.Team[0]
    const myQueue = queueState.Queues.Personal[0]
    DEBUG(func, `Queues to check: {teamQueue: ${teamQueue}, myQueue: ${myQueue}}`);
    return { teamQueue, myQueue };
  } catch (error) {
    DEBUG(func, `Error fetching queue status: ${error.message}`);
    process.exit(2)
  }
};

const processPhxHttpResponse = async (queueData) => {
  const func = "processPhxHttpResponse"
  try {
    DEBUG(func, `Processing HTTP response data for teamQueue`);
    const baseCaseRecord = queueData?.data?.context;
    let caseRecords = baseCaseRecord.globalValueProviders[1]?.values?.records || baseCaseRecord.globalValueProviders[2]?.values?.records;
    let caseNumbers = [];

    DEBUG(func, `Verifying if caseRecords are intact`);
    if (!caseRecords) {
      logger.error(`Case records missing or malformed. Please check the configuration file at ${configurationFilePath}`);
      process.exit(2);
    }

    DEBUG(func, `Loading supported product list from configuration`);
    const supportedProduct = await readConfigurationFile({ type: configurationTypes.products, filePath: configurationFilePath });
    DEBUG(func, `Matching case records with supported products`);
    for (let key in supportedProduct) {
      if (supportedProduct[key][0]) {
        Object.keys(caseRecords).forEach((recordKey) => {
          let productDisplayValue = caseRecords[recordKey].Case.record.fields.Product__r.displayValue
          if (productDisplayValue && productDisplayValue.toLowerCase().includes(key.toLowerCase()) && !productDisplayValue.toLowerCase().includes('cloud')) {
            if (productCaseCount.hasOwnProperty(key)) {
              productCaseCount[key] += 1;
              caseNumbers.push(caseRecords[recordKey].Case.record.fields.CaseNumber.value);
            }
          }
        });
      }
    }

    DEBUG(func, `Displaying case counts for supported products`);
    printCasesInConsole(productCaseCount, supportedProduct);

    DEBUG(func, `Printing queue information for mainQueue`);
    printPersonalQueue({ cases: productCaseCount, queue: configurationTypes.mainQueue });

    DEBUG(func, `Saving case numbers to file`);
    writeCaseListFile(caseNumbers, caseNumberFile);
  } catch (error) {
    DEBUG(func, `Error in processing teamQueue response: ${error.message}`);
    handleFailedResponse(error, 'in processPhxHttpResponse');
  }
};

const processMyHttpResponse = async (queueData) => {
  const func = "processMyHttpResponse"
  try {
    DEBUG(func, `Processing HTTP response data for myQueue`);
    const CaseCommitments = [];
    const baseCaseRecord = queueData?.data?.context;
    let myCases = baseCaseRecord.globalValueProviders[1]?.values?.records || baseCaseRecord.globalValueProviders[2]?.values?.records;

    DEBUG(func, `Verifying if caseRecords are intact`);
    if (!myCases) {
      logger.error(`Case records missing or malformed. Please check the configuration file at ${configurationFilePath}`);
      process.exit(2);
    }

    DEBUG(func, `Extracting case data and commitment details`);
    Object.values(myCases).forEach((record) => {
      let field = record.Case.record.fields;
      CaseCommitments.push({ CaseNumber: field.CaseNumber.value, Countdown: field.Time_Before_Next_Update_Commitment__c.value, Status: field.Status.value });
    });

    DEBUG(func, `Displaying personal queue information`);
    printPersonalQueue({ cases: CaseCommitments, queue: configurationTypes.myQueue });
  } catch (error) {
    DEBUG(func, `Error in processing myQueue response: ${error.message}`);
    handleFailedResponse(error, 'in processMyHttpResponse');
  }
};

const handleFailedResponse = (err, context = '') => {
  const func = "handleFailedResponse"
  logger.error(`HTTP Error ${err} - ${statusCodeMapping[err]}`);
  DEBUG(func, `Handling HTTP status code ${err}.`)

  if (err == 400) {
    DEBUG(func, `Bad Request (400) - Unrecoverable error, exiting.`);
    process.exit(2);
  }
  if (err == 401) {
    DEBUG(func, `Unauthorized (401) - Possible token issue, recoverable.`);
    process.exit(1);
  }
  if (err == 404) {
    DEBUG(func, `Not Found (404) - Unrecoverable error, exiting.`);
    process.exit(2);
  }
  process.exit(2);
};

const printCasesInConsole = async (cases, supportedProduct) => {
  const func = "printCasesInConsole"
  let newCases = false
  DEBUG(func, `Displaying case counts for supported products`);

  Object.keys(cases).forEach((product) => {
    DEBUG(func, `Displaying ${cases[product]} ${product} case(s)`);
    if (supportedProduct[product][0] && cases[product] > 0) {
      logger.info(`  -> ${cases[product]} ${product} case(s)`);
      newCases = true
    }
  });

  if (!newCases) {
    console.log('  No new cases')
    DEBUG(func, `No new cases matching the supported products in ${configurationFilePath}`);
  }
};

const printPersonalQueue = ({ cases, queue }) => {
  const func = "printPersonalQueue"
  if (queue === configurationTypes.myQueue) {
    let commitmentNeeded = 0
    let inSupportCase = 0
    let newCase = 0

    DEBUG(func, `Calculating case categories for myQueue`);

    Object.values(cases).forEach((record) => {
      if (record.Countdown < 1) commitmentNeeded += 1
      if (record.Status.toLowerCase().includes('support')) inSupportCase += 1
      if (record.Status.toLowerCase().includes('new')) newCase += 1
    })

    if (commitmentNeeded || inSupportCase || newCase) logger.info()

    DEBUG(func, `Displaying case statuses in the console`);
    if (commitmentNeeded > 0) logger.warn(`  ${commitmentNeeded} case(s) need an update within 24 hours`)
    if (inSupportCase > 0) logger.warn(`  ${inSupportCase} case(s) are In Support`)
    if (newCase > 0) logger.warn(`  ${newCase} case(s) are new and need an IC`)
    if (!commitmentNeeded && !inSupportCase && !newCase) console.log(`  No case updates`)
  }
};

RunValidations();