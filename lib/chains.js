'use strict';

const bcurl = require('bcurl');
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');
const zmq = require('zeromq');

class Chains extends EventEmitter {
  constructor(options) {
    super();

    this.options = options;
    this.logger = options.logger.context('chains');

    this.bitcoin = bcurl.client({
      port: options.test ? 18443 : 8332,
      username: 'blockclock',
      password:
        '6fbf427e1d5efa490284add72d34f777515913f92c3d296c0d08a525b286daff'
    });

    this.JSONfile = path.join(__dirname, '..', 'html', 'blocks.json');
    this.blocks = {};
  }

  async init() {
    if (this.options.reset) {
      try {
        this.logger.warning('Deleting JSON file...');
        fs.unlinkSync(this.JSONfile);
      } catch(e) {
        this.logger.warning('No JSON file found.');
      }
    }

    try {
      this.blocks = JSON.parse(fs.readFileSync(this.JSONfile));
      this.logger.info(
        'Loaded blocks.json file: found %d blocks',
        Object.keys(this.blocks).length
      );
    } catch (e) {
      if (e.code === 'ENOENT') {
        this.logger.info(
          'No blocks.json file found, loading last 20 blocks by timestamp...'
        );
        await this.latest();
      } else {
        throw e;
      }
    }
  }

  async open() {
    const sub = new zmq.Subscriber();
    const endpoints = [
      'tcp://127.0.0.1:21000'
    ];
    for (const ep of endpoints) {
      sub.connect(ep);
    }

    const topics = ['hashblock', 'hashtx'];
    for (const t of topics) {
      sub.subscribe(t);
    }

    for await (const [topicBuf, payload] of sub) {
      const topic = topicBuf.toString();

      switch (topic) {
        case 'hashblock':
          await this.addBlock(payload.toString('hex'));
          break;
        case 'hashtx':
          await this.addTX(payload.toString('hex'));
          break;
      }
    }
  }

  now() {
    return Math.floor(new Date().getTime() / 1000);
  }

  writeBlocks() {
    fs.writeFileSync(
      this.JSONfile,
      JSON.stringify(this.blocks, null, 2)
    );
  }

  checkIntegrity() {
    try {
      const file = JSON.parse(fs.readFileSync(this.JSONfile));
      assert.deepStrictEqual(this.blocks, file);
    } catch (e) {
      if (e.code !== 'ENOENT')
        throw e;
      else
        assert.deepStrictEqual(this.blocks, []);
    }
  }

  async latest() {
    const height = await this.bitcoin.execute('/', 'getblockcount', []);

    for (let i = height; i > height - 20; i--) {
      const hash = await this.bitcoin.execute('/', 'getblockhash', [i]);
      const header = await this.bitcoin.execute('/', 'getblockheader', [hash]);
      header.recvtime = header.time;
      this.blocks[header.height] = header;
    }

    this.writeBlocks();
  }

  async addBlock(hash) {
    this.logger.info(
      'Got block hash: %s',
      hash
    );
    const json = await this.bitcoin.execute('/', 'getblockheader', [hash]);
    json.recvtime = this.now();
    this.blocks[json.height] = json;
    this.logger.info(`  Block height: ${json.height}`);
    this.trimBlocks();
    this.writeBlocks();

    this.emit('block', this.blocks);
  }

  async addTX(hash) {
    this.logger.info(
      'Got tx hash %s',
      hash,
    );

    try {
      const json = await this.bitcoin.execute(
        '/',
        'getrawtransaction',
        [hash, true]
      );

      const txDetails = {
        hash,
        outputs: json.vout
      };

      this.logger.info(json);

      this.emit('tx', txDetails);
    } catch(e) {
      ;
    }
  }

  async sendMempool(socket) {
    // const hashes = await this.hsd.getMempool();
    // for (const hash of hashes) {
    //   const tx = await this.hsd.getTX(hash);
    //   this.addTX(TX.fromJSON(tx), socket);
    // }
  }

  trimBlocks() {
    const keys = Object.keys(this.blocks);
    const length = keys.length;
    if (length <= 20)
      return;

    const heights = keys.map(x => parseInt(x));
    const min = Math.min(...heights);
    delete this.blocks[String(min)];

    this.trimBlocks();
  }

  async test() {
    const hsdinfo = await this.hsd.getInfo();
    console.log(hsdinfo);
  }
}

module.exports = Chains;
