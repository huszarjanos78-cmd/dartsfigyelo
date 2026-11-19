import { mkdir, copyFile } from 'node:fs/promises';

// npm ci verifies the exact package versions and integrity in package-lock.json.
// Ship all assets with Pages: camera images never leave the browser for OCR.
const destination = new URL('../dist/vendor/ocr/', import.meta.url);
await mkdir(destination, { recursive: true });
const files = [
  ['tesseract.js/dist/tesseract.min.js', 'tesseract.min.js'],
  ['tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['tesseract.js/dist/tesseract.min.js.LICENSE.txt', 'tesseract.min.js.LICENSE.txt'],
  ['tesseract.js/dist/worker.min.js.LICENSE.txt', 'worker.min.js.LICENSE.txt'],
  ['tesseract.js/LICENSE.md', 'TESSERACT-JS-LICENSE.txt'],
  ['tesseract.js-core/LICENSE', 'TESSERACT-CORE-LICENSE.txt'],
  ['@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'eng.traineddata.gz'],
  ...['', '-simd', '-relaxedsimd'].map(variant => [
    `tesseract.js-core/tesseract-core${variant}-lstm.wasm.js`,
    `tesseract-core${variant}-lstm.wasm.js`
  ])
];
for (const [source, target] of files) {
  await copyFile(new URL('../node_modules/' + source, import.meta.url), new URL(target, destination));
}
console.log('Local OCR assets prepared (Tesseract.js 7.0.0, English digit model).');
