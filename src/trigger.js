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
    await validateConfiguration(configurationFilePath)
    await validateCredentials(credentialFilePath)
    await validateProducts(configurationFilePath)
    await validateQueues(queueStatusFile)
    // Once validations are complete, run the Trigger script
    TriggerStartup()
  } catch (error) {
    ERROR(func, `Error during RunValidations: ${error.message}`);
    process.exit(2)
  }
};

const TriggerStartup = async () => {
  const func = "TriggerStartup"
  let phxConfiguration, myConfiguration;
  try {
    DEBUG(func, `Calling the queuesToCheck function`)
    const queueShouldBeChecked = await queuesToCheck();
    DEBUG(func, `Reading the credentials configured in ${credentialFilePath}`)
    const credentials = await readCredentials(credentialFilePath)
    DEBUG(func, `Configured to check teamQueue: ${JSON.parse(queueShouldBeChecked.teamQueue)}`)
    if (JSON.parse(queueShouldBeChecked.teamQueue)) {
      phxConfiguration = await readConfigurationFile({ type: configurationTypes.mainQueue, filePath: configurationFilePath });
    }
    DEBUG(func, `Configured to check myQueue: ${JSON.parse(queueShouldBeChecked.myQueue)}`)
    if (JSON.parse(queueShouldBeChecked.myQueue)) {
      myConfiguration = await readConfigurationFile({ type: configurationTypes.myQueue, filePath: configurationFilePath });
      DEBUG(func, `Successfully read ${configurationTypes.myQueue} from ${configurationFilePath} in readConfigurationFile`)
    }
    if (JSON.parse(queueShouldBeChecked.teamQueue) && phxConfiguration.url && phxConfiguration.message && phxConfiguration.context && phxConfiguration.pageUri) {
      DEBUG(func, `Sending request to HTTP handler for phxConfiguration`)
      const phxQueueResponse = await httpRequest({ requestConfig: phxConfiguration, credentials: credentials });
      if (phxQueueResponse && phxQueueResponse.status === 200) {
        DEBUG(func, `HTTP handler returned a ${phxQueueResponse.status} response`)
        DEBUG(func, `Calling for HTTP response processing`)
        processPhxHttpResponse(phxQueueResponse);
      } else {
        DEBUG(func, `HTTP handler returned a ${phxQueueResponse.status} response`)
        handleFailedResponse(phxQueueResponse.status);
      }
    }
    if (JSON.parse(queueShouldBeChecked.myQueue) && myConfiguration.url && myConfiguration.message && myConfiguration.context && myConfiguration.pageUri) {
      DEBUG(func, `Sending request to HTTP handler for myConfiguration`)
      const myQueueResponse = await httpRequest({requestConfig: myConfiguration, credentials: credentials})
      if (myQueueResponse && myQueueResponse.status === 200) {
        DEBUG(func, `HTTP handler returned a ${myQueueResponse.status} response`)
        DEBUG(func, `Calling for HTTP response processing`)
        processMyHttpResponse(myQueueResponse);
      } else {
        DEBUG(func, `HTTP handler returned a ${myQueueResponse.status} response`)
        handleFailedResponse(myQueueResponse.status);
      }
    } 
  } catch (error) {
    ERROR(func, `Error during TriggerStartup: ${error.message}`);
    process.exit(2)
  }
};

const queuesToCheck = async () => {
  const func = "queuesToCheck"
  try {
    DEBUG(func, `Calling readQueueStatus`)
    const queueState = await readQueueStatus(queueStatusFile)
    const teamQueue = queueState.Queues.Team[0]
    const myQueue = queueState.Queues.Personal[0]
    DEBUG(func, `Returning: {teamQueue: ${teamQueue}, myQueue: ${myQueue}}`)
    return ({teamQueue,myQueue})
  } catch (error) {
    DEBUG(func, `${error.message}`)
    process.exit(2)
  }
}

const processPhxHttpResponse = async (queueData) => {
  const func = "processPhxHttpResponse"
  try {
    DEBUG(func, `Breaking up HTTP response data`)
    let baseCaseRecord = queueData?.data?.context;
    let caseRecords = baseCaseRecord.globalValueProviders[1]?.values?.records || baseCaseRecord.globalValueProviders[2]?.values?.records;
    let caseNumbers = [];
    DEBUG(func, `Checking if caseRecords were corrupted in the HTTP response`)
    if (!caseRecords) {
      logger.error(`Case records are missing or malformed in response data.\n > Possible Copy/Paste issues in ${configurationFilePath} \n > Edit the file and restart.`);
      process.exit(2);
    }
    DEBUG(func, `Calling readConfigurationFile to provide supported products to next function`)
    const supportedProduct = await readConfigurationFile({type: configurationTypes.products, filePath: configurationFilePath});
    DEBUG(func, `Looping through queue for a match of supported products`)
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
    DEBUG(func, `Calling printCasesInConsole`)
    printCasesInConsole(productCaseCount, supportedProduct);
    DEBUG(func, `Calling printPersonalQueue`)
    printPersonalQueue({cases: productCaseCount, queue: configurationTypes.mainQueue});
    DEBUG(func, `Calling writeCaseListFile`)
    writeCaseListFile(caseNumbers, caseNumberFile);
  } catch (error) {
    DEBUG(func, `Calling handleFailedResponse from processPhxHttpResponse`)
    handleFailedResponse(error, 'in processPhxHttpResponse');
  }
};

const processMyHttpResponse = async (queueData) => {
  const func = "processMyHttpResponse"
  try {
    DEBUG(func, `Breaking up HTTP response data`)
    const CaseCommitments = []
    let baseCaseRecord = queueData?.data?.context;
    let myCases = baseCaseRecord.globalValueProviders[1]?.values?.records || baseCaseRecord.globalValueProviders[2]?.values?.records;
    DEBUG(func, `Checking if caseRecords were corrupted in the HTTP response`)
    if (!myCases) {
      logger.error(`Case records are missing or malformed in response data.\n > Possible Copy/Paste issues in ${configurationFilePath} \n > Edit the file and restart.`);
      process.exit(2);
    }
    DEBUG(func, `Reading the cases and their corresponding data elements`)
    Object.values(myCases).forEach((record) => {
      let field = record.Case.record.fields
      CaseCommitments.push({CaseNumber: field.CaseNumber.value, Countdown: field.Time_Before_Next_Update_Commitment__c.value, Status: field.Status.value})
    })
    DEBUG(func, `Calling runSeleniumDriver for configurationTypes.myQueue`)
    printPersonalQueue({cases: CaseCommitments, queue: configurationTypes.myQueue});
  } catch (error) {
    DEBUG(func, `Calling handleFailedResponse from processMyHttpResponse`)
    handleFailedResponse(error, 'in processMyHttpResponse')
  }
}

const handleFailedResponse = (err, context = '') => {
  const func = "handleFailedResponse"
  logger.error(`Error ${err} ${statusCodeMapping[err]}`);
  DEBUG(func, `Handling HTTP status code ${err}.`)
  if (err == 400) DEBUG(func, `HTTP err code: ${err} is unrecoverable, exiting`) & process.exit(2);
  if (err == 401) DEBUG(func, `HTTP err code: ${err} is recoverable, possible token issue`) & process.exit(1);
  if (err == 404) DEBUG(func, `HTTP err code: ${err} is unrecoverable, exiting`) & process.exit(2);
  else process.exit(2);
};

const printCasesInConsole = async (cases, supportedProduct) => {
  const func = "printCasesInConsole"
  let newCases = false
  DEBUG(func, `Looping over the cases returned and printing the number of corresponding case counts per product`)
  Object.keys(cases).forEach(product => {
    DEBUG(func, `Printing to the console there are ${cases[product]} ${product} cases`)
    if (supportedProduct[product][0] && cases[product] > 0) {
      logger.info(`  -> ${cases[product]} ${product} case(s)`);
      newCases = true
    }
  });
  if (!newCases) console.log('  No new cases') & DEBUG(func, `No cases matching the supported products configured in ${configurationFilePath}`);
}

const printPersonalQueue = ({cases, queue}) => {
  const func = "printPersonalQueue"
  if (queue === configurationTypes.myQueue) {

    let commitmentNeeded = 0
    let inSupportCase = 0
    let newCase = 0
    DEBUG(func, `Calculating the number of commitments needed from cases requiring a commitment in less than 24 hrs.`)
    Object.values(cases).forEach((record) => {
      if (record.Countdown < 1) commitmentNeeded += 1
    })
    DEBUG(func, `Calculating the number of 'In Support' cases`)
    Object.values(cases).forEach((record) => {
      if (record.Status.toLowerCase().includes('support')) inSupportCase += 1
    })
    DEBUG(func, `Calculating the number of 'New' cases needing and Initial Commitment`)
    Object.values(cases).forEach((record) => {
      if (record.Status.toLowerCase().includes('new')) newCase += 1
    })
    if (commitmentNeeded || inSupportCase || newCase) logger.info()
    DEBUG(func, `Writing to the console the necessary case updates required at this time`)
    if (commitmentNeeded > 0) logger.warn(`  ${commitmentNeeded} case(s) need an update within 24 hours`)
    if (inSupportCase > 0) logger.warn(`  ${inSupportCase} case(s) are In Support`)
    if (newCase > 0) logger.warn(`  ${newCase} case(s) are new and need an IC`)
    if (!commitmentNeeded && !inSupportCase && !newCase) console.log(`  No case updates`)
  }
};

RunValidations();