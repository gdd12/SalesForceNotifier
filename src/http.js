const axios = require('axios');
const { DEBUG, ERROR } = require('./logger')

const httpRequest = async ({requestConfig, credentials}) => {
  const func = 'httpRequest'
  DEBUG(func, 'Initializing HTTP request')
  try {
    DEBUG(func, 'Reading credentials from function call')
    const { sid, token } = credentials
    DEBUG(func, `Making HTTP call`)
    const response = await axios.post(requestConfig.url, {
      'message': requestConfig.message,
      'aura.context': requestConfig.context,
      'aura.pageURI': requestConfig.pageUri,
      'aura.token': token
    }, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'Cookie': `sid=${sid}`
      }
    });
    DEBUG(func, 'HTTP call completed, returning response data')
    return response
  } catch (error) {
    DEBUG(func, `HTTP call failure, returning error to callback`)
    ERROR(func, `HTTP request error - ${error}`)
    return error
  }
};

module.exports = { httpRequest };