import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';

// Official OpenCV.js 4.13.0 build, embedded WASM. The hash pins the exact tested file.
const expected = '63366510248adf3a7eddf3e793dd825404efb7df3749f4d6f8557c7fa4ca8aa0';
const destination = new URL('../dist/vendor/opencv.js', import.meta.url);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
try { if (sha(await readFile(destination)) === expected) { console.log('OpenCV 4.13.0 ready.'); process.exit(0); } } catch {}
const response = await fetch('https://docs.opencv.org/4.13.0/opencv.js');
if (!response.ok) throw new Error('OpenCV download failed: ' + response.status);
const bytes = Buffer.from(await response.arrayBuffer());
if (sha(bytes) !== expected) throw new Error('The upstream OpenCV build changed. Reverify the dependency before updating its pinned hash.');
await mkdir(new URL('../dist/vendor/', import.meta.url), { recursive: true });
await writeFile(destination, bytes);
console.log('OpenCV 4.13.0 downloaded and verified.');
