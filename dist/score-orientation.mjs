import { ellipsePoint } from './board-vision.mjs?v=0.11.0';

const sectors = [20,1,18,4,13,6,10,15,2,17,3,19,7,16,8,11,14,9,12,5];
const step = Math.PI / 10;
const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

// Colours repeat every two sectors. Only the printed numbers identify 20.
// Require at least three distinct labels to agree; repeated OCR passes of the
// same label must never count as independent evidence.
export function rotationFromNumbers(observations) {
  const votes = [];
  for (const {text, confidence, x, y} of observations) {
    if (!/^(?:[1-9]|1[0-9]|20)$/.test(text) || !Number.isFinite(confidence) || confidence < 45 ||
        !Number.isFinite(x) || !Number.isFinite(y)) continue;
    const radius = Math.hypot(x, y);
    if (radius < 1.04 || radius > 1.36) continue;
    const sector = Number(text);
    votes.push({sector, confidence, rotation: wrap(Math.atan2(x, -y) - sectors.indexOf(sector)*step)});
  }
  const clusters = votes.map(seed => {
    const labels = new Map();
    for (const vote of votes) {
      if (Math.abs(wrap(vote.rotation - seed.rotation)) > .065) continue;
      if (!labels.has(vote.sector) || labels.get(vote.sector).confidence < vote.confidence) labels.set(vote.sector, vote);
    }
    const matches = [...labels.values()];
    const rotation = Math.atan2(matches.reduce((sum, v) => sum + Math.sin(v.rotation)*v.confidence, 0),
      matches.reduce((sum, v) => sum + Math.cos(v.rotation)*v.confidence, 0));
    return {rotation, count: matches.length, weight: matches.reduce((sum, v) => sum + v.confidence, 0)};
  }).sort((a,b) => b.count-a.count || b.weight-a.weight);
  const best = clusters[0];
  if (!best || best.count < 3) return null;
  const rival = clusters.find(c => Math.abs(wrap(c.rotation-best.rotation)) > .13);
  if (rival && rival.count >= best.count-1) return null;
  return best.rotation;
}

// Rectify the numbered rim, masking the playing area and background. Upscaling
// helps OCR but does not recover detail missing from a low-resolution camera.
export function numberRing(image, board, size = 800) {
  const radius = 1.4, data = new Uint8ClampedArray(size*size*4).fill(255);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (2*(x+.5)/size-1)*radius, v = (2*(y+.5)/size-1)*radius;
    const r = Math.hypot(u,v);
    if (r < 1.035 || r > 1.36) continue;
    const p = ellipsePoint(board, r, Math.atan2(v,u));
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.y < 0 || p.x >= image.width-1 || p.y >= image.height-1) continue;
    const ix = Math.floor(p.x), iy = Math.floor(p.y), fx = p.x-ix, fy = p.y-iy;
    let gray = 0;
    for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
      const j = ((iy+dy)*image.width+ix+dx)*4, d = image.data;
      gray += (d[j]*.299+d[j+1]*.587+d[j+2]*.114)*(dx ? fx : 1-fx)*(dy ? fy : 1-fy);
    }
    // Most standard boards have light wire/printed numbers on a dark rim.
    const value = 255-gray, i = (y*size+x)*4;
    data[i] = data[i+1] = data[i+2] = value;
  }
  return {width:size, height:size, data};
}

// Tesseract 7's structured output nests words in blocks/paragraphs/lines.
export function numberObservations(blocks, size, turns = 0) {
  const result = [], angle = turns*Math.PI/2, c = Math.cos(angle), s = Math.sin(angle);
  for (const block of blocks || []) for (const paragraph of block.paragraphs || [])
    for (const line of paragraph.lines || []) for (const word of line.words || []) {
      const b = word.bbox;
      if (!b) continue;
      const x = ((b.x0+b.x1)/size-1)*1.4, y = ((b.y0+b.y1)/size-1)*1.4;
      result.push({text: word.text.trim(), confidence: word.confidence, x: x*c+y*s, y: -x*s+y*c});
    }
  return result;
}

let library;
function loadLibrary() {
  if (!library) library = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('./vendor/ocr/tesseract.min.js', import.meta.url).href;
    script.onload = () => resolve(window.Tesseract);
    script.onerror = () => { script.remove(); reject(new Error('A számfelismerő nem tölthető be.')); };
    document.head.append(script);
  }).catch(error => { library = null; throw error; });
  return library;
}

export function createOrientationReader() {
  let worker, stopped = false;
  const terminate = async () => {
    const active = worker; worker = null;
    if (active) await active.terminate();
  };
  return {
    async read(image, board) {
      const ring = numberRing(image, board);
      const Tesseract = await loadLibrary();
      if (stopped) return null;
      const assets = new URL('./vendor/ocr/', import.meta.url).href;
      const engine = await Tesseract.createWorker('eng', 1, {
        workerPath: assets+'worker.min.js', corePath: assets, langPath: assets,
        workerBlobURL: false, cacheMethod: 'none', errorHandler: () => {}
      });
      worker = engine;
      try {
        if (stopped) return null;
        await engine.setParameters({tessedit_pageseg_mode:'11', tessedit_char_whitelist:'0123456789'});
        const source = document.createElement('canvas'); source.width = source.height = ring.width;
        source.getContext('2d').putImageData(new ImageData(ring.data, ring.width, ring.height), 0, 0);
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = ring.width;
        const context = canvas.getContext('2d'), observations = [];
        const angles = [0, 2, 4, 6, 1, 3, 5, 7].map(n => n*Math.PI/4), tried = [];
        for (let pass = 0; angles.length && pass < 10 && !stopped; pass++) {
          const angle = angles.shift(); tried.push(angle);
          context.save(); context.fillStyle = 'white'; context.fillRect(0,0,canvas.width,canvas.height);
          context.translate(canvas.width/2,canvas.height/2); context.rotate(angle);
          context.drawImage(source,-canvas.width/2,-canvas.height/2); context.restore();
          const {data} = await engine.recognize(canvas, {}, {blocks:true, text:false});
          if (stopped) return null;
          const found = numberObservations(data.blocks, canvas.width, angle/(Math.PI/2));
          observations.push(...found);
          const rotation = rotationFromNumbers(observations);
          if (rotation !== null) return rotation;
          // A readable 20 can propose deskewing, but cannot establish direction
          // on its own. Re-read the other labels at that angle to validate it.
          for (const label of found) {
            if (label.text !== '20' || label.confidence < 70 || Math.hypot(label.x,label.y) < 1.04 || Math.hypot(label.x,label.y) > 1.36) continue;
            const deskew = -Math.atan2(label.x,-label.y);
            if (![...tried,...angles].some(a => Math.abs(wrap(a-deskew)) < .08)) angles.unshift(deskew);
          }
        }
        return null;
      } finally { await terminate(); }
    },
    stop() { stopped = true; void terminate().catch(() => {}); }
  };
}
