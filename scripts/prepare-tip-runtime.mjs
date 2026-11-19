import {copyFile, mkdir, readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const model = new URL('../dist/models/dart-tip.onnx',import.meta.url);
const manifest = JSON.parse(await readFile(new URL('../dist/models/dart-tip.json',import.meta.url),'utf8'));
const hash=createHash('sha256').update(await readFile(model)).digest('hex');
if(hash!==manifest.sha256) throw new Error('Dart model integrity check failed');
const destination=new URL('../dist/vendor/ort/',import.meta.url);await mkdir(destination,{recursive:true});
for(const file of ['ort.wasm.min.mjs','ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm'])
  await copyFile(new URL('../node_modules/onnxruntime-web/dist/'+file,import.meta.url),new URL(file,destination));
await copyFile(new URL('../node_modules/onnxruntime-web/README.md',import.meta.url),new URL('README.md',destination));
await copyFile(new URL('../dist/models/ONNX-RUNTIME-LICENSE.txt',import.meta.url),new URL('LICENSE.txt',destination));
console.log('Verified dart-tip model and prepared local ONNX Runtime Web 1.23.2.');
