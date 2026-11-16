/* eslint-env browser */
'use strict';

// Initialize with mainnet network parameters
let params = {halvening: 210000};
let latestBlocks = {};
const state = {
  tip: {},
  mempool: [],
  blocks: []
};

// Automatically resize canvas to fit window
const canvas = document.getElementById('c1');
const ctx = canvas.getContext('2d');
canvas.width = Math.max(800, window.innerWidth);
window.addEventListener('resize', () => {
  canvas.width = Math.max(800, window.innerWidth);
});

// Clicking on canvas finds closest object and opens link
canvas.onmousedown = (e) => {
  // Check blocks first
  for (const block of state.blocks) {
    if (   e.pageX > block.x
        && e.pageX < block.x + 110
        && e.pageY > block.y
        && e.pageY < block.y + 110) {
      window.open(`https://mempool.space/block/${block.height}`, '_blank');
      return;
    }
  }

  // Find nearest mempool tx
  let hash;
  let distance = Infinity;
  for (const tx of state.mempool) {
    const d = Math.sqrt(((e.pageX - tx.x)**2) + ((e.pageY - tx.y)**2));
    if (d < distance) {
      distance = d;
      hash = tx.hash;
    }
  }

  if (hash && (distance < 50))
    window.open(`https://mempool.space/tx/${hash}`, '_blank');
};

/**
 *  DRAW ARTWORK
 */

// Art below is ported from blokstr, which draws on a 1200x1200 canvas.
// It is drawn in those units then scaled down to fit inside the clock face.
const ART_SIZE = 1200;
const ART_SCALE = 0.43;
// Center of the ring of blocks drawn in drawClock()
const CLOCK_CENTER = 392;
const DIFF_INTERVAL = 2016;
// Mempool txs are kept outside this radius around the clock
const MEMPOOL_RADIUS = 420;

// Draws tree, moon and satellite in the center of the clock
function drawArt() {
  ctx.save();
  ctx.translate(CLOCK_CENTER, CLOCK_CENTER);
  ctx.scale(ART_SCALE, ART_SCALE);

  // Same relative layout as blokstr, centered on the clock
  drawHalvening(228, -192);
  drawTree(-172, 408);

  ctx.restore();
}

// Draws tree branches recursively
// https://dev.to/lautarolobo/
// use-javascript-and-html5-to-code-a-fractal-tree-2n69
function drawBranches(startX, startY, len, angle, branchWidth, grd, base) {
  ctx.lineWidth = branchWidth;

  ctx.beginPath();
  ctx.save();

  // Draw one branch
  ctx.translate(startX, startY);
  ctx.rotate(angle * Math.PI/180);
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -len);

  // Stroke in the tree's base coordinates so the gradient
  // spans the whole tree instead of each rotated branch
  ctx.save();
  ctx.setTransform(base);
  ctx.strokeStyle = grd;
  ctx.stroke();
  ctx.restore();

  // End recursion once lines get too short
  if (len < 5) {
    ctx.restore();
    return;
  }

  // Get fractal angle from merkle tree root
  const merkleroot = state.tip.merkleroot;
  const hashBytePos = (parseInt(len) % 4) * 2; // get hex position
  const hashByteHex = merkleroot.slice(hashBytePos, hashBytePos + 2);
  const tweak = parseInt(hashByteHex, 16) % 45;

  drawBranches(0, -len, len * 0.8, angle - tweak, branchWidth * 0.8, grd, base);
  drawBranches(0, -len, len * 0.8, angle + tweak, branchWidth * 0.8, grd, base);

  ctx.restore();
}

// Initiates recursive fractal branch-drawing
function drawTree(offX, offY) {
  // Compute percent of full block weight
  // for starting line length
  const weight = state.tip.weight || 4000000;
  const len = (ART_SIZE * 0.11) * (weight / 4000000);

  // Estimate tree height
  const treeHeight = len * 3;

  // Create color gradient for "background" of tree from merkleroot hash
  const merkleroot = state.tip.merkleroot;
  const grd = ctx.createLinearGradient(offX, offY, offX, offY - treeHeight);
  const color1 = '#' + merkleroot.slice(-6);
  const color0 = '#' + merkleroot.slice(-12, -6);
  grd.addColorStop(0, color0);
  grd.addColorStop(1, color1);

  drawBranches(offX, offY, len, 0, 10, grd, ctx.getTransform());
}

// Moon phase shows progress towards next halvening
function drawHalvening(offX, offY) {
  const pct = (state.tip.height % params.halvening) / params.halvening;
  let radius = ART_SIZE / 7;
  radius -= 30;
  const shadow = radius * 2 * pct;

  // Hue from the target mantissa, with fixed saturation and lightness
  // so the moon stays bright against the black background
  const mantissa = parseInt(state.tip.bits.slice(2), 16);
  const hue0 = mantissa % 360;
  const hue1 = (hue0 + 60) % 360;
  const color0 = `hsl(${hue0}, 80%, 65%)`;
  const color1 = `hsl(${hue1}, 80%, 75%)`;

  ctx.lineWidth = 4;

  // Everything inside the moon is clipped to the moon circle
  ctx.save();
  ctx.beginPath();
  ctx.arc(offX, offY, radius, 0, Math.PI * 2);
  ctx.clip();

  // moon circle fill
  const grd = ctx.createLinearGradient(
    offX - radius, offY,
    offX + radius, offY);
  grd.addColorStop(0, color0);
  grd.addColorStop(1, color1);
  ctx.fillStyle = grd;
  ctx.fill();

  // shadow circle
  ctx.beginPath();
  ctx.arc(offX - shadow, offY, radius, 0, Math.PI * 2);

  // shadow circle border
  ctx.strokeStyle = color0;
  ctx.stroke();

  // shadow circle fill
  ctx.fillStyle = '#000';
  ctx.fill();

  ctx.restore();

  // moon circle border
  ctx.beginPath();
  ctx.arc(offX, offY, radius, 0, Math.PI * 2);
  ctx.strokeStyle = color1;
  ctx.stroke();

  drawDiffAdj(offX, offY, radius);
}

// Satellite orbits the moon showing progress towards next difficulty adjustment
function drawDiffAdj(offX, offY, radius) {
  radius += 26;
  const pct = (state.tip.height % DIFF_INTERVAL) / DIFF_INTERVAL;
  const angle = ((Math.PI * 2) * pct) - (Math.PI * 0.5);
  const markX = offX + (radius * Math.cos(angle));
  const markY = offY + (radius * Math.sin(angle));

  // satellite
  const nonce = state.tip.nonce.toString(16).padStart(8, '0');
  ctx.fillStyle = '#' + nonce.slice(0, 6);
  ctx.strokeStyle = '#' + nonce.slice(2);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.font = '64px monospace';
  ctx.fillText('¤', markX, markY);
  ctx.strokeText('¤', markX, markY);
}

// Draw block using colors derived from its hash
// and place around the circle based on time since received
function drawBlock(block, offX, offY, size = 1, tip = false) {
  // Compute proportions of 'bit' circles and text
  const fontSize = 64 / size;
  const d = 26 / size;
  const r = d / 2;

  // Derive two colors from the last 6 bytes of the block hash
  const hash = block.hash;
  const color1 = '#' + hash.slice(-6);
  const color0 = '#' + hash.slice(-12, -6);

  // If this is the tip, we draw its hash in the favicon too :-)
  let favicon = null;
  let favctx = null;
  if (tip) {
    favicon = document.createElement('canvas');
    favicon.width = 16;
    favicon.height = 16;
    favctx = favicon.getContext('2d');
  }

  // Draw hash's bits in 32 x 32 grid with two colors
  for (let y = 0; y < 16 ; y++) {
    // Each row is 2 bytes, 16 bits
    const row = hash.slice(y * 4, (y * 4) + 4);
    const bits = parseInt(row, 16).toString(2);
    const fill = '0000000000000000';
    const pattern = fill.slice(bits.length) + bits;

    for (let x = 0; x < 16; x++) {
      const bit = pattern[x];

      // Draw bit dot with corresponding color
      ctx.beginPath();
      ctx.lineWidth = 0.2;
      ctx.fillStyle = parseInt(bit) ? color1 : color0;
      ctx.strokeStyle = 'black';
      ctx.arc(
        (x + 1) * d - r + offX,
        (y + 1) * d - r + offY,
        r,
        0,
        2 * Math.PI
      );
      ctx.fill();
      ctx.stroke();

      // favicon
      if (tip) {
        favctx.fillStyle = ctx.fillStyle;
        favctx.fillRect(x, y, x, y);
      }

      // Store block's coordinates in state for click-distancing
      if (x === 0 && y === 0) {
        state.blocks.unshift({
          height: block.height,
          x: (x + 1) * d - r + offX + (canvas.width / 2) - 400,
          y: (y + 1) * d - r + offY
        });
      }
    }
  }

  // insert favicon if this was tip
  if (tip) {
    const link = document.getElementById('favicon');
    link.href = favicon.toDataURL('image/x-icon');
  }

  // Block caption: height and time since received
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'bottom';
  ctx.textAlign = 'left';
  ctx.font = 'bold ' + String(fontSize) + 'px Courier';
  if (block.minago != null) {
    ctx.fillText(
      '#' + block.height + ' 0:' + block.minago.toString().padStart(2, '0'),
      offX,
      (18 * d) + offY + 4
    );
  }
}

// Refresh the entire display
function drawClock() {
  // Blank slate
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  state.blocks.length = 0;

  // Translate to center given window width
  ctx.save();
  ctx.translate((canvas.width / 2) - 400, 0);

  // Tree, moon and satellite are drawn first (background)
  drawArt();

  // Draw each block received in the last hour
  const now = new Date().getTime() / 1000;
  for (const height of Object.keys(latestBlocks)) {
    const block = latestBlocks[height];
    // Compute time since block was received
    const minago = Math.max(Math.floor((now - block.recvtime) / 60), 0);
    if (minago > 60)
      continue;

    // Draw block at its corresponding time around clock face
    block.minago = minago;
    const degrees = 360 - ((180 + minago * 6) % 360);
    const rads = degrees * (Math.PI / 180);
    const clockrad = 340;
    const x = Math.floor(clockrad * Math.sin(rads));
    const y = Math.floor(clockrad * Math.cos(rads));
    let tip = false;
    if (parseInt(height) === state.tip.height)
      tip = true;
    drawBlock(block, x + clockrad, y + clockrad, 4, tip);
  }

  // restore context to full width for mempool
  ctx.restore();

  // Mempool stars go on top
  drawMempool();
}

function drawMempool() {
  for (const tx of state.mempool)
    drawTX(tx);
}

function drawTX(tx) {
  const r = 2;

  ctx.save();
  ctx.lineWidth = 0;

  // set tx position around clock
  const y1 = (parseInt(tx.hash.slice(2, 4), 16) / 255) * canvas.height;

  // Exclude the chord of the clock circle at this height
  const cx = (canvas.width / 2) - 400 + CLOCK_CENTER;
  const cy = CLOCK_CENTER;
  const dy = y1 - cy;
  const halfChord = Math.sqrt(Math.max(0, MEMPOOL_RADIUS ** 2 - dy ** 2));
  const left = Math.max(0, cx - halfChord);
  const right = Math.min(canvas.width, cx + halfChord);

  // Spread tx across the space remaining on either side of the circle
  let x1 =
    (parseInt(tx.hash.slice(0, 2), 16) / 255) *
    (left + canvas.width - right);
  if (x1 >= left)
    x1 += right - left;

  ctx.translate(x1, y1);

  // save location in state.mempool for click-distance checks
  tx.x = x1;
  tx.y = y1;

  // rotate each tx spiral every second
  const tick = (Date.now() / 1000) % 360;
  ctx.rotate(
    ((parseInt(tx.hash.slice(4, 6), 16) / 255 * 360) - (tick * 6))
    * (Math.PI / 180)
  );

  // compute the angle of the spiral based on tx size
  const l = tx.outputs.length;
  let x = 1;
  x = l < 20 ? 1.1 : x;
  x = l < 10 ? 1.8 : x;
  x = l < 5  ? 4 : x;

  // draw outputs
  for (let i = 0; i < l; i++) {
    const rads = (Math.PI * x) / ((i + 55) * 0.15);
    ctx.beginPath();
    ctx.fillStyle = '#ffffff';
    ctx.arc(
      0,
      0,
      r,
      0,
      2 * Math.PI
    );
    ctx.fill();

    // next output will be drawn at some offset to create spiral
    ctx.translate(0, r * 2);
    ctx.rotate(rads);
  }

  ctx.restore();
}

/**
 *  SET GLOBAL DATA
 */

// Find the chain tip in the blocks object and set global
function setTip() {
  const keys = Object.keys(latestBlocks);
  const heights = keys.map(x => parseInt(x));
  const max = Math.max(...heights);
  state.tip = latestBlocks[String(max)];
}

/**
 *  NETWORK UTILS
 */

// Make an async http request
function get(endpoint, callback = () => {}) {
  const http = new XMLHttpRequest();
  http.open('GET', endpoint, true);
  http.onreadystatechange = function() {
    if (http.readyState === 4) {
      if (http.status === 200) {
        callback(http.response);
      } else {
        console.error(`Failed to load "${endpoint}": ` + http.statusText);
      }
    }
  };
  http.send(null);
}

/**
 *  RUN APPLICATION
 */

// Initialize socket to server to recieve real-time updates
function openSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(protocol + '//' + window.location.host + window.location.pathname);
  socket.addEventListener('message', (event) => {
    const data = event.data;

    // event type = MESSAGE
    if (data[0] !== '4')
      return;
    // packet type = EVENT
    if (data[1] !== '2')
      return;

    // We always expect JSON, and it starts after the first two metadata btyes
    const json = JSON.parse(data.slice(2));

    // Message is a new block!
    if (json[0] === 'blocks') {
      latestBlocks = json[1];
      setTip();
      // Reset mempool
      state.mempool.length = 0;
    }

    // Message is a mempool tx
    if (json[0] === 'tx') {
      state.mempool.push(json[1]);
    }
  });

  // Keep connection alive with ping
  setInterval(() => {
    socket.send('2');
  }, 15000);
}

// Download network parameters and initial block state
get('params', (res) => {
  params = JSON.parse(res);
  get('blocks.json', (res) => {
    latestBlocks = JSON.parse(res);
    setTip();
    drawClock();
    openSocket();
  });
});

// TICK TOCK!
setInterval(drawClock, 1000);
