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
  logger.debug(`DEBUG [${func}] ${message}`)
}

const ERROR = async (func, message) => {
  logger.error(`ERROR [${func}] ${message}`)
}

module.exports = { logger, DEBUG, ERROR };