import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const root=new URL('../../',import.meta.url);
const server=createServer(async(req,res)=>{
  try {
    const file=new URL('.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname),root);
    if(!file.href.startsWith(root.href))throw Error('path');
    res.setHeader('Content-Type',file.pathname.endsWith('.mjs')?'text/javascript':file.pathname.endsWith('.wasm')?'application/wasm':file.pathname.endsWith('.html')?'text/html':'application/octet-stream');
    res.end(await readFile(file));
  }catch {res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,...(process.env.DARTS_BROWSER_EXECUTABLE?{executablePath:process.env.DARTS_BROWSER_EXECUTABLE}:{})});
try {
  const page=await browser.newPage();const failures=[],external=[];
  page.on('pageerror',e=>failures.push(e.message));
  page.on('request',r=>{if(!r.url().startsWith(origin)&&!r.url().startsWith('blob:'))external.push(r.url());});
  await page.goto(origin+'/dist/index.html');
  const names=['d1_02_04_2020 IMG_1093','d1_02_04_2020 IMG_1099','d2_02_03_2021 DSC_0544','d2_02_03_2021 DSC_0557'];
  const results=await page.evaluate(async names=>{
    const {createDartTipReader}=await import('/dist/dart-tip-reader.mjs');const reader=createDartTipReader(),results=[];
    try {for(const name of names) {
      const image=new Image();image.src='/tests/fixtures/dart-tips/'+encodeURIComponent(name+'.JPG');await image.decode();
      const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
      const pixels=ctx.getImageData(0,0,image.width,image.height);
      const labels=(await (await fetch('/tests/fixtures/dart-tips/'+encodeURIComponent(name+'.txt'))).text()).trim().split('\n').map(l=>l.split(/\s+/).map(Number)).filter(l=>l[0]===4).map(l=>({x:l[1]*image.width,y:l[2]*image.height}));
      const prediction=await reader.read(pixels);
      results.push({name,...prediction,errors:labels.map(p=>Math.min(999,...prediction.tips.map(q=>Math.hypot(p.x-q.x,p.y-q.y))))});
    }}finally{reader.stop();}return results;
  },names);
  // These source-dataset images are regression checks, NOT held-out accuracy evidence.
  for(const result of results.slice(1)) {
    assert.equal(result.tips.length,3,result.name);assert.ok(result.errors.every(e=>e<5),JSON.stringify(result));
  }
  // Known occlusion/miss remains represented in the regression corpus.
  assert.ok(results[0].tips.length<3,'Do not hide the known missed tip');
  assert.deepEqual(failures,[]);assert.deepEqual(external,[]);
  console.log(JSON.stringify(results.map(({name,tips,errors,milliseconds})=>({name,tips:tips.length,errors,milliseconds})),null,2));
  console.log('Real ONNX model, module worker, local WASM and labelled photographs: passed.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
