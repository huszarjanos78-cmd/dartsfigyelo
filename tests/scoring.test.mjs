import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreAt, estimateHit, boardCoordinates } from '../dist/scoring.mjs';
import { projectPoint } from '../dist/calibration.mjs';
test('Standard rings, sectors, bull and misses',()=>{
 for(const [x,y,score] of [[0,0,50],[0,-.07,25],[0,-.3,20],[0,-.6,60],[0,-.98,40],[0,-1.1,0],[.5,0,6],[0,.5,3],[-.5,0,11]]) assert.equal(scoreAt(x,y).score,score);
 assert.equal(scoreAt(NaN,0),null);
 assert.equal(scoreAt(.5,0,Math.PI/2).score,20);
});
test('Coordinates invert a perspective board',()=>{
 const homography=[100,12,200,5,70,150,.1,-.05];
 const p=projectPoint(homography,.3,-.6), q=boardCoordinates({homography},p.x,p.y);
 assert.ok(Math.abs(q.x-.3)<1e-9 && Math.abs(q.y+.6)<1e-9);
});
test('Persistent shaft change estimates triple 20, no change stays unknown',()=>{
 const size=200, base=new Float32Array(size*size).fill(100), current=base.slice();
 current.gridSize=size; current.gridRadius=1; current.gridPositions=Int32Array.from({length:base.length},(_,i)=>i);
 assert.equal(estimateHit(current,base),null);
 for(let y=25;y<40;y++)for(let x=99;x<102;x++)current[y*size+x]=180;
 assert.equal(estimateHit(current,base).score,60);
});

test('All twenty sectors and rings follow a rotated board', () => {
  const sectors = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
  for (const rotation of [0, .71, -2.1]) {
    sectors.forEach((sector, index) => {
      const angle = rotation + index * Math.PI / 10;
      for (const [radius, multiplier] of [[.3, 1], [103/170, 3], [.8, 1], [166/170, 2]]) {
        assert.deepEqual(scoreAt(Math.sin(angle)*radius, -Math.cos(angle)*radius, rotation),
          {score: sector*multiplier, sector, multiplier});
      }
    });
  }
});

test('Coordinates invert a rotated affine board', () => {
  const board = {x: 220, y: 180, a: 130, b: 75, angle: .6};
  const x = .4, y = -.7, c = Math.cos(board.angle), s = Math.sin(board.angle);
  const point = boardCoordinates(board, board.x + x*board.a*c - y*board.b*s,
    board.y + x*board.a*s + y*board.b*c);
  assert.ok(Math.abs(point.x-x)<1e-9 && Math.abs(point.y-y)<1e-9);
  assert.equal(boardCoordinates({homography: [0,0,0,0,0,0,0,0]}, 1, 1), null);
});

test('Fine colour evidence uses the sampler radius and ignores uniform exposure', () => {
  const size = 100, base = new Float32Array(size*size).fill(100), current = base.slice();
  current.gridSize = size; current.gridRadius = 1.4;
  current.gridPositions = Int32Array.from({length: base.length}, (_, i) => i);
  base.fine = new Float32Array(base.length*3).fill(100);
  current.fine = base.fine.slice();
  current.fine.fill(140);
  assert.equal(estimateHit(current, base), null);
  for (let y = 15; y < 29; y++) for (let x = 49; x < 51; x++) current.fine[(y*size+x)*3] = 210;
  assert.equal(estimateHit(current, base).score, 60);
});
