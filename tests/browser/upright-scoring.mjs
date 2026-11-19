import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const root = new URL('../../dist/', import.meta.url);
const types = {js:'text/javascript',mjs:'text/javascript',html:'text/html',css:'text/css',gz:'application/gzip'};
const server = createServer(async (request,response) => {
  try {
    const path = new URL(request.url,'http://localhost').pathname.replace(/^\/dartsfigyelo\//,'');
    const file = new URL(path || 'index.html',root);
    if (!file.href.startsWith(root.href)) throw new Error('Invalid path');
    response.setHeader('Content-Type', types[file.pathname.split('.').at(-1)] || 'application/octet-stream');
    response.end(await readFile(file));
  } catch {response.writeHead(404).end();}
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({headless:true, ...(process.env.DARTS_BROWSER_EXECUTABLE ? {executablePath:process.env.DARTS_BROWSER_EXECUTABLE} : {})});
try {
  const page = await browser.newPage({viewport:{width:390,height:844}});
  const errors = [], external = [], failures = [], ocrRequests = [];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if (/ocr|tesseract|score-orientation/.test(request.url())) ocrRequests.push(request.url()); if (!request.url().startsWith(origin) && !request.url().startsWith('blob:')) external.push(request.url());});
  page.on('response',response=>{if(response.status()>=400 && !response.url().endsWith('/favicon.ico'))failures.push(response.url());});
  await page.addInitScript(() => {
    // Real canvas video stream: exercise camera startup, OpenCV detection,
    // settling and upright-board scoring controls without a physical camera.
    window.fixture = () => {
      const canvas=document.createElement('canvas');canvas.width=canvas.height=900;
      const ctx=canvas.getContext('2d');ctx.fillStyle='#656565';ctx.fillRect(0,0,900,900);
      ctx.translate(450,450);ctx.fillStyle='#171717';ctx.beginPath();ctx.arc(0,0,400,0,Math.PI*2);ctx.fill();
      for(let i=0;i<20;i++) {
        const a=-Math.PI/2+(i-.5)*Math.PI/10, b=a+Math.PI/10;
        for(const [r,colour] of [[300,i%2?'#ddd1ad':'#191919'],[300,i%2?'#18833d':'#bb2521'],[286,i%2?'#ddd1ad':'#191919'],[189,i%2?'#18833d':'#bb2521'],[175,i%2?'#ddd1ad':'#191919']]) {
          ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,r,a,b);ctx.closePath();ctx.fillStyle=colour;ctx.fill();
        }
      }
      for(const [r,colour] of [[28,'#18833d'],[11,'#bb2521']]) {ctx.fillStyle=colour;ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();}
      return canvas;
    };
    navigator.mediaDevices.getUserMedia = async () => {
      window.cameraFixture=window.fixture();
      const live=window.cameraFixture.getContext('2d');
      setInterval(()=>{live.save();live.resetTransform();live.fillStyle='#656565';live.fillRect(0,0,1,1);live.restore();},100);
      return window.cameraFixture.captureStream(10);
    };
  });
  await page.goto(origin+'/dartsfigyelo/');
  await page.locator('summary').click();
  await page.locator('#voice').uncheck();
  await page.locator('summary').click();
  assert.equal(await page.locator('#score-orient').count(),0);
  assert.equal(await page.locator('#score-retry').count(),1);
  await page.locator('#start').click();
  console.log('Camera started.');
  await page.waitForFunction(()=>!document.getElementById('lock').disabled,{},{timeout:60000});
  await page.locator('#lock').click();
  console.log('Board locked.');
  assert.match(await page.locator('#score-orientation').innerText(), /20 felül/);
  await page.waitForFunction(()=>document.getElementById('status').textContent.includes('Jöhet a dobás'),{},{timeout:20000});
  await page.waitForFunction(()=>document.getElementById('score-orientation').textContent.includes('Tartalék pontozás'),{},{timeout:10000});
  assert.equal(await page.locator('#count').innerText(),'0');
  console.log('Unreadable number-free image → actual number reader → upright fallback scoring: passed.');
  await page.evaluate(()=>{
    const context=window.cameraFixture.getContext('2d');context.save();
    context.strokeStyle='#fefefe';context.lineWidth=5;context.beginPath();context.moveTo(0,-181);context.lineTo(0,-240);context.stroke();context.restore();
  });
  await page.waitForFunction(()=>document.getElementById('count').textContent==='1',{},{timeout:20000});
  assert.equal(await page.locator('#score-total').innerText(),'60');
  await page.getByLabel('1. nyíl pontértéke',{exact:true}).selectOption({label:'D20 · 40'});
  assert.equal(await page.locator('#score-total').innerText(),'40');
  await page.evaluate(()=>{const ctx=window.cameraFixture.getContext('2d');ctx.save();ctx.resetTransform();ctx.drawImage(window.fixture(),0,0);ctx.restore();});
  await page.waitForFunction(()=>document.getElementById('count').textContent==='0',{},{timeout:20000});
  assert.equal(await page.locator('#score-total').innerText(),'0');
  assert.match(await page.locator('#score-orientation').innerText(),/20 felül/);
  console.log('Automatic T20 estimate, manual D20 correction and automatic round recovery: passed.');
  assert.ok(ocrRequests.some(url=>url.endsWith('/eng.traineddata.gz')),'Number reading must actually run before the fallback is confirmed');
  assert.match(await page.locator('#score-orientation').innerText(),/nem adott biztos irányt/);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(failures,[]);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  console.log('No page errors, external image/OCR requests, missing assets or mobile horizontal overflow.');
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
