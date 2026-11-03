import assert from 'node:assert/strict';
import { test } from 'node:test';
import { zoomCrop } from '../dist/camera-view.mjs';
import { inspectBoardChange, looksLikeRemoval } from '../dist/retrieval-guard.mjs';

function frame(rect = null, brightness = 100) {
  const size = 192, positions = [], values = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (Math.hypot(x - 95.5, y - 95.5) > 94) continue;
    positions.push(y * size + x);
    values.push(rect && x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h ? 170 : brightness);
  }
  const result = new Float32Array(values); result.gridSize = size; result.gridPositions = new Int32Array(positions);
  return result;
}
test('Zoom uses a bounded, aspect-preserving crop', () => {
  assert.deepEqual(zoomCrop(640, 480, 1), { x: 0, y: 0, width: 640, height: 480 });
  assert.deepEqual(zoomCrop(640, 480, 2), { x: 160, y: 120, width: 320, height: 240 });
  const crop = zoomCrop(960, 1280, 3, { x: .5, y: .4 });
  assert.equal(crop.width / crop.height, 960 / 1280);
  assert.ok(crop.x >= 0 && crop.y >= 0 && crop.y + crop.height <= 1280);
  assert.equal(zoomCrop(640, 480, 0).width, 640);
  assert.equal(zoomCrop(640, 480, 20).width, 640 / 3);
});
test('A compact hand-sized patch below the old 14% cutoff is rejected', () => {
  const delta = inspectBoardChange(frame({ x: 90, y: 70, w: 24, h: 24 }), frame());
  assert.ok(delta.ratio < .035);
  assert.equal(delta.obstructed, true);
});
test('Broad body-sized changes pause, while a narrow dart and flight remain countable', () => {
  const empty = frame();
  assert.equal(inspectBoardChange(frame({ x: 60, y: 40, w: 45, h: 60 }), empty).obstructed, true);
  for (const rect of [{ x: 95, y: 60, w: 4, h: 40 }, { x: 95, y: 70, w: 14, h: 22 }]) {
    const delta = inspectBoardChange(frame(rect), empty);
    assert.ok(delta.ratio > .0035);
    assert.equal(delta.obstructed, false);
  }
});
test('Uniform exposure changes are not an occlusion', () => {
  const delta = inspectBoardChange(frame(null, 120), frame());
  assert.equal(delta.ratio, 0); assert.equal(delta.obstructed, false);
});
test('Removing a dart is distinguished from adding one', () => {
  const empty = frame(), hit = frame({ x: 95, y: 60, w: 4, h: 40 });
  assert.equal(looksLikeRemoval(empty, hit, empty), true);
  assert.equal(looksLikeRemoval(hit, empty, empty), false);
});
