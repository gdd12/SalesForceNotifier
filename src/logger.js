const winston = require('winston');
const kleur = require('kleur');

const colors = {
  error: 'red',
  info: 'green',
  warn: 'yellow',
  debug: 'black'
};

const logFormat = winston.format.printf(({ level, message }) => {
  const color = colors[level] || 'white';
  return `${kleur[color](message)}`;
});

const logger = winston.createLogger({
  level: process.env.DEBUG === 'true' ? 'debug' : 'info',
  format: winston.format.combine(logFormat),
  transports: [
    new winston.transports.Console()
  ]
});

const DEBUG = async (func, message) => {
  const date = new Date();
  const debugTimestamp = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')},${date.getMilliseconds().toString().padStart(3, '0')}`;
  logger.debug(`${debugTimestamp} - DEBUG [${func}] ${message}`)
}

const ERROR = async (func, message) => {
  const date = new Date();
  const debugTimestamp = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')},${date.getMilliseconds().toString().padStart(3, '0')}`;
  logger.error(`${debugTimestamp} - ERROR [${func}] ${message}`)
}

module.exports = { logger, DEBUG, ERROR };