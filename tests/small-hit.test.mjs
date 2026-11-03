import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scene } from './scene.mjs';
import { createBoardSampler, sampleBoard, frameDifference, createMotionReference, estimateCameraShift } from '../dist/board-vision.mjs';
import { smallHitEvidence, confirmSmallHit } from '../dist/hit-evidence.mjs';

const e = { x: 240, y: 180, a: 145, b: 100, angle: .4 };
const map = createBoardSampler(480, 360, { ...e, a: e.a * .79, b: e.b * .79 });
function thinArrow(image, angle, colour) {
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    const dx = x - e.x, dy = y - e.y;
    const u = (dx * Math.cos(e.angle) + dy * Math.sin(e.angle)) / e.a;
    const v = (-dx * Math.sin(e.angle) + dy * Math.cos(e.angle)) / e.b;
    const along = u * Math.cos(angle) + v * Math.sin(angle), across = -u * Math.sin(angle) + v * Math.cos(angle);
    let rgb;
    if (along > .2 && along < .55 && Math.abs(across) < .004) rgb = [8, 8, 8];
    if (along > .5 && along < .58 && Math.abs(across) < .025) rgb = colour;
    if (rgb) { const i = (y * image.width + x) * 4; image.data.set(rgb, i); }
  }
  return image;
}
for (const angle of [.2, .65, 1.2, 2]) {
  test(`A thin shaft and small coloured flight remain visible at position ${angle}`, () => {
    const empty = sampleBoard(scene({ b: e.b, angle: e.angle }), map);
    const hit = sampleBoard(thinArrow(scene({ b: e.b, angle: e.angle }), angle, [30, 120, 160]), map);
    assert.ok(smallHitEvidence(hit, empty, 3));
    const first = confirmSmallHit(null, smallHitEvidence(hit, empty, 3));
    const second = confirmSmallHit(first, smallHitEvidence(hit, empty, 3));
    assert.equal(confirmSmallHit(second, smallHitEvidence(hit, empty, 3)).frames, 3);
  });
}
test('New fine evidence recovers a small hit missed by the coarse default threshold', () => {
  const empty = sampleBoard(scene({ b: e.b, angle: e.angle }), map);
  const hit = sampleBoard(thinArrow(scene({ b: e.b, angle: e.angle }), .65, [30, 120, 160]), map);
  assert.ok(frameDifference(hit, empty).ratio < .0035);
  assert.ok(smallHitEvidence(hit, empty, 3));
});
test('No change, exposure shift and compensated camera jitter cannot create a fine hit', () => {
  const image = scene({ b: e.b, angle: e.angle }), empty = sampleBoard(image, map);
  assert.equal(smallHitEvidence(empty, empty, 3), null);
  const brighter = { ...image, data: new Uint8ClampedArray(image.data) };
  for (let i = 0; i < brighter.data.length; i++) if (i % 4 !== 3) brighter.data[i] += 10;
  assert.equal(smallHitEvidence(sampleBoard(brighter, map), empty, 3), null);
  const reference = createMotionReference(image, e);
  for (const [x, y] of [[242, 179], [240.5, 179.25]]) {
    const moved = scene({ x, y, b: e.b, angle: e.angle }), shift = estimateCameraShift(moved, reference);
    assert.equal(smallHitEvidence(sampleBoard(moved, map, shift.x, shift.y), empty, 3), null);
  }
});
test('A transient or moving patch cannot accumulate confirmation frames', () => {
  const a = { x: 80, y: 90, area: 30 };
  assert.equal(confirmSmallHit(confirmSmallHit(null, a), null), null);
  assert.equal(confirmSmallHit(confirmSmallHit(null, a), { ...a, x: 100 }).frames, 1);
});
