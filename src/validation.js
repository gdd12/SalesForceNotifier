const fs = require('fs').promises;
const xml2js = require('xml2js');
const { logger, DEBUG, ERROR } = require("./logger")

async function checkConfigFileExistence(filePath) {
  const func = "checkConfigFileExistence"
  try {
    DEBUG("Validation", `Checking for the existance of the configuration file`)
    await fs.access(filePath);
    DEBUG('Validation', ` >> Successful check`)
    return
  } catch (err) {
    // Run the script to create the file
    DEBUG('Validation', ` >> Failed check`)
    process.exit(3)
  }
}

const validateConfiguration = async (filePath) => {
  const func = "validateConfiguration"
  DEBUG(`Validation`, `****************************** Validation Checks ******************************`)
  try {
    await checkConfigFileExistence(filePath)
    let currentCheck, currentLocation, currentErrorCount
    const dataFromFile = await fs.readFile(filePath, 'utf8');
    const sanitizedData = dataFromFile.replace(/&(?!amp;|lt;|gt;|quot;|#\d+;)/g, '&amp;');
    const result = await xml2js.parseStringPromise(sanitizedData);
    currentCheck = result.Config.SalesForceData[0];
    currentLocation = 'Config.SalesForceData'
    currentErrorCount = 0

    DEBUG(`Validation`, `Performing validation checks on the config for the main queue`)

    if (currentCheck.url[0].trim() == 0) ERROR(func, `${currentLocation}.url missing in ${filePath}`), currentErrorCount += 1 
    if (currentCheck.message[0].trim() == 0) ERROR(func, `${currentLocation}.message missing in ${filePath}`), currentErrorCount += 1 
    if (currentCheck.context[0].trim() == 0) ERROR(func, `${currentLocation}.context missing in ${filePath}`), currentErrorCount += 1 
    if (currentCheck.pageUri[0].trim() == 0) ERROR(func, `${currentLocation}.pageUri missing in ${filePath}`), currentErrorCount += 1 

    if (currentErrorCount > 0) {
      DEBUG('Validation', ` >> Failed check`)
      throw new Error(`Unrecoverable error in ${filePath}`);
    }
    DEBUG('Validation', ` >> Successful check`)
    currentCheck = result.Config.PersonalQueue[0];
    currentLocation = 'Config.PersonalQueue'
    currentErrorCount = 0
    DEBUG(`Validation`, `Performing validation checks on the config for the personal queue`)
    if (currentCheck.url[0].trim() == 0) ERROR(func, `${currentLocation}.url missing in ${filePath}`), currentErrorCount += 1 
    if (currentCheck.message[0].trim() == 0) ERROR(func, `${currentLocation}.message missing in ${filePath}`), currentErrorCount += 1
    if (currentCheck.context[0].trim() == 0) ERROR(func, `${currentLocation}.context missing in ${filePath}`), currentErrorCount += 1
    if (currentCheck.pageUri[0].trim() == 0) ERROR(func, `${currentLocation}.pageUri missing in ${filePath}`), currentErrorCount += 1
    switch (currentErrorCount) {
      case 0:
        DEBUG('Validation', ` >> Successful check`)
        return;
      case 4:
        DEBUG('Validation', `Although there are errors, logic determined there is no configuration for the ${filePath}, continuing`);
        DEBUG('Validation', ` >> Successful check`)
        return;
      default:
        DEBUG('Validation', `${func} Missing required configuration in ${filePath}, unrecoverable fatal error`);
        DEBUG('Validation', ` >> Failed check`)
        throw new Error(`Unrecoverable error in ${filePath}`);
    }
  } catch (error) {
    ERROR(func, `Unrecoverable error while performing validation checks on configuration files. ${error.message}`)
    return process.exit(2)
  }
}

const validateCredentials = async (filePath) => {
  const func = "validateCredentials"
  DEBUG(`Validation`, `Performing validation checks on the credentials file`)
  try {
    const dataFromFile = await fs.readFile(filePath, 'utf8');
    const sanitizedData = dataFromFile.split('\n')
    if (sanitizedData[0].length > 1 && sanitizedData[1].length > 1) DEBUG('Validation', ` >> Successful check`)
    else { 
      DEBUG('Validation', ` >> Failed check`)
      throw new Error(`Missing required credentials in ${filePath}, unrecoverable fatal error`)
    }
  } catch (error) {
    ERROR(func, `Unrecoverable error while performing validation checks on credentials file.`)
    return process.exit(1)
  }
}

const validateProducts = async (filePath) => {
  const func = "validateProducts"
  DEBUG(`Validation`, `Performing validation checks on the configuration file for the supported products`)
  try {
    const dataFromFile = await fs.readFile(filePath, 'utf8');
    const sanitizedData = dataFromFile.replace(/&(?!amp;|lt;|gt;|quot;|#\d+;)/g, '&amp;');
    const result = await xml2js.parseStringPromise(sanitizedData);

    currentCheck = result.Config.Products[0];
    const productValues = Object.values(currentCheck);
    let emptyProductCount = 0;
    productValues.forEach((value) => {
      if (value == '') emptyProductCount += 1
    });
    if (emptyProductCount == productValues.length) {
      DEBUG('Validation', ` >> Failed check`)
      throw new Error(`Atleast one product must be set to 'true' in ${filePath}`)
    }
    DEBUG('Validation', ` >> Successful check`)
  } catch (error) {
    ERROR(func, `Unrecoverable error while performing validation checks on configuration file for the support products. ${error}`)
    process.exit(2)
  }
}

const validateQueues = async (filePath) => {
  const func = "validateQueues"
  DEBUG(`Validation`, `Performing validation checks on the queues.xml file`)
  try {
    const dataFromFile = await fs.readFile(filePath, 'utf8');
    const result = await xml2js.parseStringPromise(dataFromFile);
    const teamValue = result.Queues?.Team?.[0];
    const personalValue = result.Queues?.Personal?.[0];
    
    if (teamValue === null || personalValue === null) {
      DEBUG('Validation', ` >> Failed check`)
      throw new Error('Error: Team or Personal queue is null.');
    }
    if (teamValue !== "true" && teamValue !== "false") {
      DEBUG('Validation', ` >> Failed check`)
      throw new Error('Error: Team value is neither true nor false.');
    }
    if (personalValue !== "true" && personalValue !== "false") {
      DEBUG('Validation', ` >> Failed check`)
      throw new Error('Error: Personal value is neither true nor false.');
    }
    DEBUG('Validation', ` >> Successful check`)
  } catch (error) {
    ERROR(func, `Unrecoverable error while performing validation checks. ${error.message}`)
    process.exit(2)
  }
}

module.exports = { validateConfiguration, validateCredentials, validateQueues, validateProducts }