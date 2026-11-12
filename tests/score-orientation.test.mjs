import test from 'node:test';
import assert from 'node:assert/strict';
import { rotationFromNumbers, numberObservations, numberRing } from '../dist/score-orientation.mjs';
const sectors = [20,1,18,4,13,6,10,15,2,17,3,19,7,16,8,11,14,9,12,5];
const label = (sector, rotation, confidence = 95) => {
  const angle = rotation + sectors.indexOf(sector)*Math.PI/10;
  return {text:String(sector),confidence,x:Math.sin(angle)*1.2,y:-Math.cos(angle)*1.2};
};
const angularError = (a,b) => Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));

test('Three distinct printed numbers establish orientation across the angle boundary', () => {
  for (const rotation of [0,.48,-.9,2.8,Math.PI-.01,-Math.PI+.01]) {
    const actual = rotationFromNumbers([label(20,rotation),label(5,rotation+.01),label(1,rotation-.01)]);
    assert.ok(actual !== null && angularError(actual,rotation)<.005);
  }
});
test('No labels, one label, duplicate passes, low confidence and colours alone cannot set direction', () => {
  for (const input of [[],[label(20,0)],Array(10).fill(label(20,0)),[label(20,0),label(5,0)],
    [label(20,0,44),label(5,0,44),label(1,0,44)]]) assert.equal(rotationFromNumbers(input),null);
});
test('Competing rotations, non-sector labels and text inside the playing area are rejected', () => {
  const first = [20,5,1].map(n=>label(n,.4)), second = [18,13,17].map(n=>label(n,1.2));
  assert.equal(rotationFromNumbers([...first,...second]),null);
  assert.equal(rotationFromNumbers(first.map(l=>({...l,x:l.x*.5,y:l.y*.5}))),null);
  assert.equal(rotationFromNumbers(first.map(l=>({...l,text:'120'}))),null);
  assert.equal(rotationFromNumbers(first.map(l=>({...l,x:NaN}))),null);
  assert.ok(angularError(rotationFromNumbers([...first,label(3,2),label(9,-1)]),.4)<.001);
});
test('OCR bounding boxes are mapped back from each quarter turn', () => {
  for (const turns of [0,1,2,3,.7]) {
    const original = label(20,.6), angle = turns*Math.PI/2, c = Math.cos(angle), s = Math.sin(angle);
    const x = (original.x*c-original.y*s)/1.4, y = (original.x*s+original.y*c)/1.4;
    const cx = (x+1)*400, cy = (y+1)*400;
    const blocks = [{paragraphs:[{lines:[{words:[{text:'20',confidence:90,bbox:{x0:cx-10,x1:cx+10,y0:cy-10,y1:cy+10}}]}]}]}];
    const [actual] = numberObservations(blocks,800,turns);
    assert.ok(Math.abs(actual.x-original.x)<1e-9 && Math.abs(actual.y-original.y)<1e-9);
  }
  assert.deepEqual(numberObservations(null,800),[]);
});
test('Number-ring sampling masks the playing field and off-camera pixels', () => {
  const width=120,height=120,data=new Uint8ClampedArray(width*height*4).fill(255);
  const ring=numberRing({width,height,data},{x:60,y:60,a:40,b:40,angle:0},100);
  const gray = (x,y) => ring.data[(y*100+x)*4];
  assert.equal(gray(50,50),255);
  assert.equal(gray(50,7),0);
  assert.equal(gray(0,0),255);
  const clipped=numberRing({width,height,data},{x:-200,y:-200,a:40,b:40,angle:0},100);
  assert.ok(clipped.data.every(n=>n===255));
});
