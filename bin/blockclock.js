'use strict';

const Path = require('path');
const Logger = require('blgr');

const Webserver = require('../lib/webserver');

const html = Path.join(__dirname, '..', 'html');
const logger = new Logger();
logger.set({
  level: 'debug',
  console: true,
  file: false
});

const webserver = new Webserver({
  test: false,
  reset: false,
  html,
  logger
});

(async () => {
  await logger.open();
  await webserver.init();
})().catch((err) => {
  console.error(err.stack);
  process.exit(1);
});
