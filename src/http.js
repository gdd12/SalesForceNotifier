const axios = require('axios');

const httpRequest = async ({requestConfig, credentials}) => {
  try {
    const { sid, token } = credentials
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
    return response
  } catch (error) {
    return error
  }
};

module.exports = { httpRequest };