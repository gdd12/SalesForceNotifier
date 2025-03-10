const logger = require("./logger")
const { httpRequest } = require("./http")
const { readConfigurationFile, readCredentials, readQueueStatus } = require("./readFiles")

const srcPath = process.env.NODE_PATH
const configurationFilePath = `${srcPath}/config/configuration.xml`;
const credentialFilePath = `${srcPath}/config/credentials.txt`;
const queueStatusFile = `${srcPath}/config/queues.xml`

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
  Api: 0
};

const statusCodeMapping = {
  200: "Success",
  400: "Bad Request",
  401: "Unauthorized",
  404: "Not Found",
  500: "Server Error"
}

const TriggerStartup = async () => {
  let phxConfiguration, myConfiguration;
  try {
    const queueShouldBeChecked = await queuesToCheck();
    const credentials = await readCredentials(credentialFilePath)

    if (queueShouldBeChecked.teamQueue === 'true') {
      phxConfiguration = await readConfigurationFile({ type: configurationTypes.mainQueue, filePath: configurationFilePath });
    }
    if (queueShouldBeChecked.myQueue === 'true') {
      myConfiguration = await readConfigurationFile({ type: configurationTypes.myQueue, filePath: configurationFilePath });
    }

    if (queueShouldBeChecked.teamQueue === 'true' && phxConfiguration) {
      const phxQueueResponse = await httpRequest({ requestConfig: phxConfiguration, credentials: credentials });
      if (phxQueueResponse && phxQueueResponse.status === 200) {
        processPhxHttpResponse(phxQueueResponse);
      } else {
        handleFailedResponse(phxQueueResponse.status);
      }
    }
    if (queueShouldBeChecked.myQueue === 'true' && myConfiguration) {
      const myQueueResponse = await httpRequest({requestConfig: myConfiguration, credentials: credentials})
      if (myQueueResponse && myQueueResponse.status === 200) {
        processMyHttpResponse(myQueueResponse);
      } else {
        handleFailedResponse(myQueueResponse.status);
      }
    }

  } catch (error) {
    logger.error(`Error during TriggerStartup: ${error.message}`, error);
    return;
  }
};

const queuesToCheck = async () => {
  try {
    const queueState = await readQueueStatus(queueStatusFile)
    const teamQueue = queueState.Queues.Team[0]
    const myQueue = queueState.Queues.Personal[0]
    return ({teamQueue,myQueue})
  } catch (error) {
    logger.error(`ERROR: Could not process the request to ${queueStatusFile}`)
  }
}

const processPhxHttpResponse = async (queueData) => {
  try {
    let baseCaseRecord = queueData?.data?.context;
    let caseRecords = baseCaseRecord.globalValueProviders[1]?.values?.records || baseCaseRecord.globalValueProviders[2]?.values?.records;

    if (!caseRecords) {
      logger.error(`Case records are missing or malformed in response data.\n > Possible Copy/Paste issues in ${configurationFilePath} \n > Edit the file and restart.`);
      process.exit(2);
    }
    const supportedProduct = await readConfigurationFile({type: configurationTypes.products, filePath: configurationFilePath});

    for (let key in supportedProduct) {
      if (supportedProduct[key][0]) {
        Object.keys(caseRecords).forEach((recordKey) => {
          let productDisplayValue = caseRecords[recordKey].Case.record.fields.Product__r.displayValue
          if (productDisplayValue && productDisplayValue.toLowerCase().includes(key.toLowerCase()) && !productDisplayValue.toLowerCase().includes('cloud')) {
            if (productCaseCount.hasOwnProperty(key)) {
              productCaseCount[key] += 1;
            }
          }
        });
      }
    }
    printCasesInConsole(productCaseCount, supportedProduct);
    printPersonalQueue({cases: productCaseCount, queue: configurationTypes.mainQueue});
  } catch (error) {
    handleFailedResponse(error, 'in processPhxHttpResponse');
  }
};

const processMyHttpResponse = async (queueData) => {
  try {
    const CaseCommitments = []
    let baseCaseRecord = queueData?.data?.context;
    let myCases = baseCaseRecord.globalValueProviders[1]?.values?.records || baseCaseRecord.globalValueProviders[2]?.values?.records;

    if (!myCases) {
      logger.error(`Case records are missing or malformed in response data.\n > Possible Copy/Paste issues in ${configurationFilePath} \n > Edit the file and restart.`);
      process.exit(2);
    }

    Object.values(myCases).forEach((record) => {
      let field = record.Case.record.fields
      CaseCommitments.push({CaseNumber: field.CaseNumber.value, Countdown: field.Time_Before_Next_Update_Commitment__c.value, Status: field.Status.value})
    })
    printPersonalQueue({cases: CaseCommitments, queue: configurationTypes.myQueue});
  } catch (error) {
    handleFailedResponse(error, 'in processMyHttpResponse')
  }
}

const handleFailedResponse = (err, context = '') => {
  logger.error(`Error ${err} ${statusCodeMapping[err]}`);

  if (err == 400) process.exit(2);
  if (err == 401) process.exit(1);
  if (err == 404) process.exit(2);
  else process.exit(2);
};

const printCasesInConsole = async (cases, supportedProduct) => {
  let newCases = false
  Object.keys(cases).forEach(product => {
    if (supportedProduct[product][0] && cases[product] > 0) {
      logger.info(`  -> ${cases[product]} ${product} case(s)`);
      newCases = true
    }
  });
  if (!newCases) console.log('  No new cases')
}

const printPersonalQueue = ({cases, queue}) => {
  if (queue === configurationTypes.myQueue) {
    let commitmentNeeded = 0
    let inSupportCase = 0
    let newCase = 0

    Object.values(cases).forEach((record) => {
      if (record.Countdown < 1) commitmentNeeded += 1
    })
    Object.values(cases).forEach((record) => {
      if (record.Status.toLowerCase().includes('support')) inSupportCase += 1
    })
    Object.values(cases).forEach((record) => {
      if (record.Status.toLowerCase().includes('new')) newCase += 1
    })
    if (commitmentNeeded > 0) logger.warn(`\nCaution: ${commitmentNeeded} case(s) need an update within 24 hours`)
    if (inSupportCase > 0) logger.warn(`\nCaution: ${inSupportCase} case(s) are In Support`)
    if (newCase > 0) logger.warn(`\nCaution: ${newCase} case(s) are new and need an IC`)
  }
};

TriggerStartup();