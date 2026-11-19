import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareTipInput,letterboxGeometry,decodeTips,confirmTipLocations,changeBounds} from '../dist/dart-tip-core.mjs';

test('Letterbox decodes to the original cropped camera coordinates, including large images',()=>{
  const geometry=letterboxGeometry({width:1920,height:1080},{x:100,y:30,width:1200,height:900});
  const data=new Float32Array(11);data[0]=700;data[1]=400;data[2]=8;data[3]=8;data[8]=.9;
  const [point]=decodeTips(data,[1,11,1],geometry);
  assert.equal(point.x,1150);assert.equal(point.y,480);
  data[0]=801;assert.equal(decodeTips(data,[1,11,1],geometry).length,0);
});
test('RGBA is RGB/255 NCHW with grey padding and no alpha channel',()=>{
  const {tensor,geometry}=prepareTipInput({width:2,height:1,data:new Uint8ClampedArray([255,0,0,0,255,0,0,255])});
  assert.equal(geometry.top,200);assert.ok(Math.abs(tensor[0]-114/255)<1e-6);
  const i=400*800+400;assert.equal(tensor[i],1);assert.equal(tensor[i+800*800],0);assert.equal(tensor[i+2*800*800],0);
});
test('Decoder rejects wrong class, invalid shape and suppresses overlapping tip boxes',()=>{
  const g=letterboxGeometry({width:800,height:800}),data=new Float32Array(33);
  for(let i=0;i<3;i++){data[i]=400+i;data[3+i]=400;data[6+i]=20;data[9+i]=20;data[24+i]=.9-i*.1;}
  data[12+2]=.99; // candidate 2 is a number, not a dart
  assert.equal(decodeTips(data,[1,11,3],g).length,1);
  assert.throws(()=>decodeTips(data,[1,12,3],g));
});
const board={},bounds={minX:-.2,maxX:.2,minY:-.7,maxY:-.5};
const hit=()=>({board,bounds});const tip={x:0,y:-.6,confidence:.9};
test('Only three consistent observations can assign a tip; motion bounds alone cannot',()=>{
  const h=hit();for(let i=0;i<2;i++)assert.equal(confirmTipLocations([h],[tip],board),false);
  assert.equal(h.point,undefined);assert.equal(confirmTipLocations([h],[tip],board),true);assert.deepEqual(h.point,{x:0,y:-.6});
  const missing=hit();for(let i=0;i<10;i++)confirmTipLocations([missing],[],board);
  assert.equal(missing.point,undefined);assert.equal(missing.tipAttempts,8);
  assert.equal(changeBounds(new Float32Array(4),new Float32Array(4)),null);
});
test('Ambiguous, moving, duplicate and out-of-region tips do not receive scores',()=>{
  for(const tips of [[tip,{...tip,x:.1}],[{...tip,x:.8}]]) {
    const h=hit();for(let i=0;i<8;i++)confirmTipLocations([h],tips,board);assert.equal(h.point,undefined);
  }
  const h=hit();for(let i=0;i<8;i++)confirmTipLocations([h],[{...tip,x:i%2?.1:0}],board);assert.equal(h.point,undefined);
  const duplicate=hit();for(let i=0;i<8;i++)confirmTipLocations([{board,point:tip},duplicate],[tip],board);assert.equal(duplicate.point,undefined);
});
test('Manual corrections and an old board cannot be overwritten by a late model result',()=>{
  for(const fields of [{corrected:{value:40}},{manuallyUnknown:true},{board:{}}]) {
    const h={...hit(),...fields};for(let i=0;i<3;i++)confirmTipLocations([h],[tip],board);assert.equal(h.point,undefined);
  }
});
