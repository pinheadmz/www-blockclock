'use strict';

const bweb = require('bweb');
const fs = require('bfile');
const Path = require('path');
const Chains = require('./chains');

class Webserver {
  constructor(options) {
    this.html = options.html;
    this.logger = options.logger.context('webserver');

    this.chains = new Chains(options);

    this.params =
      options.test ?
        {halvening: 150} :
        {halvening: 210000};

    this.http = bweb.server({
      host: '127.0.0.1',
      port: 50000,
      sockets: true,
      ssl: false
    });
  }

  async init() {
    await this.chains.init();
    this.chains.open();

    this.chains.on('block', (blocks) => {
      const ws = this.http.channel('all');

      if (ws) {
        for (const socket of ws) {
          socket.fire('blocks', blocks);
        }
      }

      this.logger.debug(
        '%d blocks sent to %d sockets',
        Object.keys(blocks).length,
        ws ? ws.size : 0
      );
      this.chains.sendMempool();
    });

    this.chains.on('tx', (txDetails, socket) => {
      const ws = socket ? [socket] : this.http.channel('all');

      let count = 0;
      if (ws) {
        for (const socket of ws) {
          socket.fire('tx', txDetails);
          count++;
        }
      }

      this.logger.debug(
        '1 tx sent to %d sockets',
        count
      );
    });

    this.http.use(this.http.router());

    this.http.handleSocket = (socket) => {
      socket.join('all');
      this.logger.debug('socket opened to %s', socket.host);
      this.chains.sendMempool(socket);
    };

    this.http.on('error', (err) => {
      console.error('Server error:', err.stack);
    });

    this.http.get('/', (req, res) => {
      this.sendFile(req, res, 'index.html');
    });

    this.http.get('/params', (req, res) => {
      res.send(200, JSON.stringify(this.params), 'json');
    });

    this.http.get('/:href(*)', (req, res) => {
      this.sendFile(req, res, req.url);
    });

    this.http.get('/:href(*)', (req, res) => {
      this.sendFile(req, res, req.url);
    });

    this.http.open();

    this.logger.info(`Webserver opened at host ${this.host}`);
  }

  sendFile(req, res, file) {
    const location = Path.join(this.html, file);
    let data = null;
    let code = 500;
    try {
      data = fs.readFileSync(location);
      code = 200;
    } catch (e) {
      code = 404;
    }
    let type;
    if (file.slice(-3) === '.js')
      type = 'text/javascript';
    if (file.slice(-5) === '.json')
      type = 'json';
    res.send(code, data, type);
    this.logger.debug(`${req.socket.remoteAddress} req: ${file} (${code})`);
  }
}

/*
 * Expose
 */

module.exports = Webserver;
