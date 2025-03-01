const winston = require('winston');
const kleur = require('kleur');

const colors = {
  error: 'red',
  info: 'green',
  warn: 'yellow',
  debug: 'cyan'
};

const logFormat = winston.format.printf(({ level, message }) => {
  const color = colors[level] || 'white';
  return `${kleur[color](message)}`;
});

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(logFormat),
  transports: [
    new winston.transports.Console()
  ]
});

module.exports = logger;