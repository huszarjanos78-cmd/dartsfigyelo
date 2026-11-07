import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBoardSampler, sampleBoard, frameDifference } from '../dist/board-vision.mjs';
import { inspectBoardChange } from '../dist/retrieval-guard.mjs';
import { smallHitEvidence } from '../dist/hit-evidence.mjs';

function rotatedPatch(length, thickness, angle, colour = false) {
  const values = [], positions = [], rgb = [], size = 192;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (Math.hypot(x - 95.5, y - 95.5) > 94) continue;
    const dx = x - 96, dy = y - 96;
    const u = dx * Math.cos(angle) + dy * Math.sin(angle), v = -dx * Math.sin(angle) + dy * Math.cos(angle);
    const changed = Math.abs(u) < length / 2 && Math.abs(v) < thickness / 2;
    values.push(changed ? 170 : 100); positions.push(y * size + x);
    rgb.push(...(changed ? [20, 130, 156] : [100, 100, 100]));
  }
  const result = new Float32Array(values); result.gridSize = size; result.gridPositions = new Int32Array(positions);
  if (colour) { result.fine = new Float32Array(rgb); result.fineNoise = new Float32Array(values.length); }
  return result;
}
test('A diagonal central dart must not be classified as retrieval', () => {
  const empty = rotatedPatch(0, 0, 0), hit = rotatedPatch(36, 10, Math.PI / 4);
  assert.ok(frameDifference(hit, empty).ratio > .006);
  assert.equal(inspectBoardChange(hit, empty).obstructed, false);
});
test('A long narrow central silhouette can exceed 3.5% without being a hand', () => {
  const empty = rotatedPatch(0, 0, 0), hit = rotatedPatch(140, 10, Math.PI / 4);
  assert.ok(frameDifference(hit, empty).ratio > .035);
  assert.equal(inspectBoardChange(hit, empty).obstructed, false);
});
test('Small diagonal colour evidence is accepted, but a broad hand still pauses', () => {
  const empty = rotatedPatch(0, 0, 0, true);
  assert.ok(smallHitEvidence(rotatedPatch(36, 10, Math.PI / 4, true), empty, 3));
  assert.ok(smallHitEvidence(rotatedPatch(140, 10, Math.PI / 4, true), empty, 3));
  assert.equal(smallHitEvidence(rotatedPatch(24, 24, Math.PI / 4, true), empty, 3), null);
  assert.equal(inspectBoardChange(rotatedPatch(24, 24, Math.PI / 4), empty).obstructed, true);
});

function projectedScene(g, side, contact, dart = false) {
  const width = 720, height = 540, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const u = (x - 360) / (160 - g * x), v = (y * (1 + g * u) - 270) / 110, along = side * u;
    let rgb = [100, 100, 100];
    if (dart && along > contact && along < contact + .14 && Math.abs(v) < .009) rgb = [20, 20, 20];
    if (dart && along > contact + .09 && along < contact + .16 && Math.abs(v) < .035) rgb = [40, 120, 180];
    const i = (y * width + x) * 4; data.set(rgb, i); data[i + 3] = 255;
  }
  return { width, height, data };
}
for (const g of [-.15, .15]) for (const side of [-1, 1]) for (const contact of [.96, 1, 1.06]) {
  test(`Projected double/rim hit: perspective ${g}, side ${side}, radius ${contact}`, () => {
    const geometry = { x: 360, y: 270, a: 160, b: 110, angle: 0, homography: [160, 0, 360, 0, 110, 270, g, 0] };
    const emptyImage = projectedScene(g, side, contact), hitImage = projectedScene(g, side, contact, true);
    const expanded = createBoardSampler(720, 540, geometry, 224, 1.18);
    const empty = sampleBoard(emptyImage, expanded), hit = sampleBoard(hitImage, expanded);
    assert.ok(smallHitEvidence(hit, empty, 3), 'The visible shaft/flight near a double must be sampled on both sides');
    assert.equal(inspectBoardChange(hit, empty).obstructed, false);
    if (contact >= 1) {
      const old = createBoardSampler(720, 540, geometry);
      assert.equal(frameDifference(sampleBoard(hitImage, old), sampleBoard(emptyImage, old)).ratio, 0,
        'Regression: the old 98% scoring mask did not observe this hit at all');
    }
  });
}
