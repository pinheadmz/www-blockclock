'use strict';

const hsclient = require('hs-client');
const {ChainEntry, TX} = require('hsd');
// const bcclient = require('bcoin/lib/client');
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');
const {BloomFilter} = require('bfilter');

class Chains extends EventEmitter {
  constructor(options) {
    super();

    this.options = options;
    this.logger = options.logger.context('chains');

    this.hsd = new hsclient.NodeClient({
      port: options.test ? 14037 : 12037
    });

    this.JSONfile = path.join(__dirname, '..', 'html', 'blocks.json');
    this.blocks = {};
  }

  async init() {
    await this.hsd.open();

    this.hsd.bind('chain connect', (entry) => {
      this.addBlock(ChainEntry.decode(entry));
    });

    const filter = new BloomFilter();
    this.hsd.setFilter(filter.encode());
    this.hsd.bind('tx', (tx) => {
      this.addTX(TX.decode(tx));
    });

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
    const info = await this.hsd.getInfo();
    const height = info.chain.height;

    for (let i = height; i > height - 20; i--) {
      const header = await this.hsd.getBlockHeader(i);
      header.recvtime = header.time;
      this.blocks[header.height] = header;
    }

    this.writeBlocks();
  }

  addBlock(entry) {
    this.logger.info(
      'Adding block height: %d hash: %x',
      entry.height,
      entry.hash
    );
    const json = entry.getJSON();
    json.recvtime = this.now();
    this.blocks[entry.height] = json;

    this.trimBlocks();
    this.writeBlocks();

    this.emit('block', this.blocks);
  }

  addTX(tx) {
    const txDetails = {
      hash: tx.hash().toString('hex'),
      outputs: []
    };

    for (const output of tx.outputs) {
      const type = output.covenant.type;
      txDetails.outputs.push(type);
    }

    this.logger.info(
      'Adding tx %x (%d outputs)',
      tx.hash(),
      txDetails.outputs.length
    );

    this.emit('tx', txDetails);
  }

  async sendMempool() {
    const hashes = await this.hsd.getMempool();
    for (const hash of hashes) {
      const tx = await this.hsd.getTX(hash);
      this.addTX(TX.fromJSON(tx));
    }
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
