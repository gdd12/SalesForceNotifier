const fs = require('fs').promises;
const xml2js = require('xml2js');
const { logger, DEBUG, ERROR } = require("./logger")

const readCredentials = async (filePath) => {
  const func = "readCredentials"
  try {
    const data = await fs.readFile(filePath, 'utf8');
    const [sid, token] = data.split('\n').map(line => line.trim());

    if (sid && token) {
      return { sid, token };
    } else {
      return logger.error('No credentials found in the file')
    }
  } catch (error) {
    logger.error(`ERROR: ${error}`)
    process.exit(1)
  }
};

const readConfigurationFile = async ({type, filePath}) => {
  const func = "readConfigurationFile"
  try {
    DEBUG(func, `Loading config file data`)
    const data = await fs.readFile(filePath, 'utf8');
    DEBUG(func, `Sanitizing ${filePath}`)
    const SFsanitizedConfig = data.replace(/&(?!amp;|lt;|gt;|quot;|#\d+;)/g, '&amp;');
    const result = await xml2js.parseStringPromise(SFsanitizedConfig);
    DEBUG(func, `Determining queue to check`)
    if (type === "request_info") {
      DEBUG(func, `Config for the queue ${type} is being read`)
      const config = result.Config.SalesForceData[0];
      DEBUG(func, `Configuration file is valid, returning config`)
      return {
        url: config.url[0],
        message: config.message[0],
        context: config.context[0],
        pageUri: config.pageUri[0]
      };
    }
    if (type === "personal_queue") {
      DEBUG(func, `Config for the queue ${type} is being read`)
      const config = result.Config.PersonalQueue[0];
      return {
        url: config.url[0],
        message: config.message[0],
        context: config.context[0],
        pageUri: config.pageUri[0]
      }
    }
    if (type === "products_list") {
      DEBUG(func, `Config for the ${type} is being read`)
      return result.Config.Products[0];
    }
  } catch (error) {
    ERROR(func, `Unable to read the configuration file. Fatal and unrecoverable. ${error.message}`);
    throw error;
  }
};

const readQueueStatus = async (filePath) => {
  const func = "readQueueStatus"
  try {
    DEBUG(func, `Reading ${filePath} for queues`)
    const data = await fs.readFile(filePath, 'utf8');
    const result = await xml2js.parseStringPromise(data);
    DEBUG(func, `Read successful`)
    return result
  } catch (error) {
    logger.error(`ERROR: Could not read queues.xml file at ${filePath}`)
    process.exit(2)
  }
}

const writeCaseListFile = async (caseNumbers, caseNumberFile) => {
  const func = "writeCaseListFile"
  try {
    DEBUG(func, `Preparing ${caseNumberFile} data, verifying its existence`)
    const loadedData = await fs.readFile(caseNumberFile, 'utf8');
    DEBUG(func, `Case number list file exists`)
    const existingCaseNumbers = new Set(loadedData.split('\n').filter(line => line.trim()));
    const newCaseNumbers = caseNumbers.filter(caseNumber => !existingCaseNumbers.has(caseNumber));
    DEBUG(func, `Appending new case numbers to the case list file`)
    if (newCaseNumbers.length > 0) {
      await fs.appendFile(caseNumberFile, newCaseNumbers.join('\n') + '\n', 'utf8');
    }
    return
  } catch (error) {
    if (error.code === 'ENOENT') {
      DEBUG(func, `Case list file does not exists, creating file`)
      await fs.writeFile(caseNumberFile, '' , 'utf8')
      DEBUG(func, `${caseNumberFile} successfully created`)
    } else {
      console.error('Error:', error);
    }
  }
}

module.exports = { readConfigurationFile, readCredentials, readQueueStatus, writeCaseListFile};