'use strict';

const bweb = require('bweb');
const fs = require('bfile');
const Path = require('path');
const Chains = require('./chains');
// const {ChainEntry} = require('hsd');

class Webserver {
  constructor(options) {
    this.html = options.html;
    this.logger = options.logger.context('webserver');

    this.chains = new Chains(options);

    this.params =
      options.test ?
        {treeinterval: 5, halvening: 2500} :
        {treeinterval: 36, halvening: 170000};

    this.http = bweb.server({
      host: '127.0.0.1',
      port: 50000,
      sockets: true,
      ssl: false
    });
  }

  async init() {
    await this.chains.init();

    this.chains.on('block', (blocks) => {
      const ws = this.http.channel('blocks');

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
    });

    this.http.use(this.http.router());

    this.http.handleSocket = (socket) => {
      this.logger.debug('socket opened to %s', socket.host);
      socket.join('blocks');
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

    // crazy fast-forward test mode
    // let height = 3000;
    // while (true) {
    //   const header = await this.chains.hsd.getBlockHeader(height);
    //   this.chains.addBlock(ChainEntry.fromJSON(header));
    //   await new Promise(r => setTimeout(r, 100));
    //   height++;
    // }
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
