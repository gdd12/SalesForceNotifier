const fs = require('fs').promises;
const xml2js = require('xml2js');
const logger = require("./logger")

const readCredentials = async (filePath) => {
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
  try {
    const data = await fs.readFile(filePath, 'utf8');
    const SFsanitizedConfig = data.replace(/&(?!amp;|lt;|gt;|quot;|#\d+;)/g, '&amp;');
    const result = await xml2js.parseStringPromise(SFsanitizedConfig);
    if (type === "request_info") {
      const config = result.Config.SalesForceData[0];
      let configurationLocation = 'Config.SalesForceData'
      let errCount = 0

      if (config.url[0].trim() == 0) logger.error(`ERROR: ${configurationLocation}.url missing in ${filePath}`), errCount +=1
      if (config.message[0].trim() == 0) logger.error(`ERROR: ${configurationLocation}.message missing in ${filePath}`), errCount +=1
      if (config.context[0].trim() == 0) logger.error(`ERROR: ${configurationLocation}.context missing in ${filePath}`), errCount +=1
      if (config.pageUri[0].trim() == 0) logger.error(`ERROR: ${configurationLocation}.pageUri missing in ${filePath}`), errCount +=1

      if (errCount > 0) {
        return process.exit(2)
      }

      return {
        url: config.url[0],
        message: config.message[0],
        context: config.context[0],
        pageUri: config.pageUri[0]
      };
    }
    if (type === "personal_queue") {
      const config = result.Config.PersonalQueue[0];
      let configurationLocation = 'Config.PersonalQueue'
      let errCount = 0;

      if (config.url[0].trim() == 0) logger.error(`ERROR: ${configurationLocation}.url missing in ${filePath}`), errCount +=1
      if (config.message[0].trim() == 0) logger.error(`ERROR: ${configurationLocation}.message missing in ${filePath}`), errCount +=1
      if (config.context[0].trim() == 0) logger.error(`ERROR: ${configurationLocation}.context missing in ${filePath}`), errCount +=1
      if (config.pageUri[0].trim() == 0) logger.error(`ERROR: ${configurationLocation}.pageUri missing in ${filePath}`), errCount +=1

      switch (errCount) {
        // If no errCount, all values exist and we can process to HTTP processing
        case 0:
          return {
            url: config.url[0],
            message: config.message[0],
            context: config.context[0],
            pageUri: config.pageUri[0]
          };
        // If all are missing, user has not defined any. This is OK, return nothing.
        case 4:
          return
        // If some configs are missing, throw error.
        default:
          return process.exit(2)
      }
    }
    if (type === "products_list") {
      if (Object.values(result.Config.Products[0]).every(val => Array.isArray(val) && val.length === 1 && val[0] === '')) {
        logger.error(`No products configured in ${filePath}`)
        process.exit(2)
      }
      return result.Config.Products[0];
    }
  } catch (error) {
    logger.error('Error reading or parsing the configuration file:', error);
    throw error;
  }
};

const readQueueStatus = async (filePath) => {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    const result = await xml2js.parseStringPromise(data);
    return result
  } catch (error) {
    logger.error(`ERROR: Could not read queues.xml file at ${filePath}`)
    process.exit(2)
  }
}

module.exports = { readConfigurationFile, readCredentials, readQueueStatus };