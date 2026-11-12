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
  const errors = [], external = [], failures = [];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if (!request.url().startsWith(origin) && !request.url().startsWith('blob:')) external.push(request.url());});
  page.on('response',response=>{if(response.status()>=400 && !response.url().endsWith('/favicon.ico'))failures.push(response.url());});
  await page.addInitScript(() => {
    // Real canvas video stream: exercise camera startup, OpenCV detection,
    // settling, automatic OCR and scoring controls without a physical camera.
    window.fixture = (rotation=0, radial=false, numbers=true, font='Arial') => {
      const canvas=document.createElement('canvas');canvas.width=canvas.height=900;
      const ctx=canvas.getContext('2d');ctx.fillStyle='#656565';ctx.fillRect(0,0,900,900);
      ctx.translate(450,450);ctx.rotate(rotation);ctx.fillStyle='#171717';ctx.beginPath();ctx.arc(0,0,400,0,Math.PI*2);ctx.fill();
      for(let i=0;i<20;i++) {
        const a=-Math.PI/2+(i-.5)*Math.PI/10, b=a+Math.PI/10;
        for(const [r,colour] of [[300,i%2?'#ddd1ad':'#191919'],[300,i%2?'#18833d':'#bb2521'],[286,i%2?'#ddd1ad':'#191919'],[189,i%2?'#18833d':'#bb2521'],[175,i%2?'#ddd1ad':'#191919']]) {
          ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,r,a,b);ctx.closePath();ctx.fillStyle=colour;ctx.fill();
        }
      }
      for(const [r,colour] of [[28,'#18833d'],[11,'#bb2521']]) {ctx.fillStyle=colour;ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();}
      const sectors=[20,1,18,4,13,6,10,15,2,17,3,19,7,16,8,11,14,9,12,5];
      ctx.font=`bold 34px ${font}`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#eee';
      if(numbers)sectors.forEach((n,i)=>{const angle=i*Math.PI/10;ctx.save();ctx.translate(Math.sin(angle)*360,-Math.cos(angle)*360);if(radial)ctx.rotate(angle);ctx.fillText(String(n),0,0);ctx.restore();});
      return canvas;
    };
    navigator.mediaDevices.getUserMedia = async () => {
      window.cameraFixture=window.fixture(.48);
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
  await page.locator('#start').click();
  console.log('Camera started.');
  await page.waitForFunction(()=>!document.getElementById('lock').disabled,{},{timeout:60000});
  await page.locator('#lock').click();
  console.log('Board locked.');
  try {
    await page.waitForFunction(()=>document.getElementById('score-orientation').textContent.includes('automatikusan felismertem'),{},{timeout:60000});
  } catch(error) {
    console.log(await page.locator('#status').innerText(), await page.locator('#score-orientation').innerText());
    console.log('Page errors:',errors);
    throw error;
  }
  assert.equal(await page.locator('#count').innerText(),'0');
  console.log('Camera stream → OpenCV lock → stable baseline → automatic number direction: passed.');
  await page.evaluate(()=>{
    const context=window.cameraFixture.getContext('2d');context.save();
    context.strokeStyle='#fefefe';context.lineWidth=5;context.beginPath();context.moveTo(0,-181);context.lineTo(0,-240);context.stroke();context.restore();
  });
  await page.waitForFunction(()=>document.getElementById('count').textContent==='1',{},{timeout:20000});
  assert.equal(await page.locator('#score-total').innerText(),'60');
  await page.getByLabel('1. nyíl pontértéke',{exact:true}).selectOption({label:'D20 · 40'});
  assert.equal(await page.locator('#score-total').innerText(),'40');
  await page.evaluate(()=>{const ctx=window.cameraFixture.getContext('2d');ctx.save();ctx.resetTransform();ctx.drawImage(window.fixture(.48),0,0);ctx.restore();});
  await page.waitForFunction(()=>document.getElementById('count').textContent==='0',{},{timeout:20000});
  assert.equal(await page.locator('#score-total').innerText(),'0');
  assert.match(await page.locator('#score-orientation').innerText(),/automatikusan felismertem/);
  console.log('Automatic T20 estimate, manual D20 correction and automatic round recovery: passed.');
  // Exercise independently rotated labels and perspective rectification.
  const results=await page.evaluate(async()=>{
    const {createOrientationReader}=await import('./score-orientation.mjs?v=0.11.0');
    const result=[];
    for(const [rotation,radial,numbers,font] of [[0,false,true,'Arial'],[2.8,false,true,'Arial'],[1.1,true,true,'Arial'],[-.6,false,true,'Times New Roman'],[0,false,false,'Arial']]) {
      const canvas=window.fixture(rotation,radial,numbers,font);
      const reader=createOrientationReader();
      const actual=await reader.read(canvas.getContext('2d').getImageData(0,0,900,900),{x:450,y:450,a:300,b:300,angle:0});
      result.push({rotation,radial,numbers,font,actual});
    }
    const {boardCoordinates} = await import('./scoring.mjs?v=0.11.0');
    const source=window.fixture(.7), pixels=source.getContext('2d').getImageData(0,0,900,900);
    const homography=[210,20,350,15,260,350,.1,-.04], image={width:700,height:700,data:new Uint8ClampedArray(700*700*4).fill(80)};
    for(let y=0;y<700;y++)for(let x=0;x<700;x++) {
      const p=boardCoordinates({homography},x,y), sx=Math.round(450+p.x*300),sy=Math.round(450+p.y*300);
      if(sx<0||sy<0||sx>=900||sy>=900)continue;
      const i=(y*700+x)*4,j=(sy*900+sx)*4;
      image.data.set(pixels.data.subarray(j,j+4),i);
    }
    const reader=createOrientationReader();
    result.push({rotation:.7,numbers:true,perspective:true,actual:await reader.read(image,{homography})});
    return result;
  });
  for(const r of results) {
    if(!r.numbers) assert.equal(r.actual,null,'An unnumbered board must stay unknown');
    else assert.ok(r.actual!==null && Math.abs(Math.atan2(Math.sin(r.actual-r.rotation),Math.cos(r.actual-r.rotation)))<.04,JSON.stringify(r));
  }
  console.log('Real local OCR: upright, rotated, radial labels, alternate font and unreadable rim passed.');
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(failures,[]);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  console.log('No page errors, external image/OCR requests, missing assets or mobile horizontal overflow.');
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
