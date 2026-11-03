import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCalibration, projectPoint, calibrationTargets } from '../dist/calibration.mjs';
import { ellipsePoint, createBoardSampler, createMotionReference, sampleBoard } from '../dist/board-vision.mjs';

const width = 480, height = 360;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
for (const side of [-1, 0, 1]) {
  test(`Bull and four rim points recover a perspective from side ${side}`, () => {
    const h = [95, 12, 240, 8, 120, 180, side * .16, .03];
    const points = [projectPoint(h, 0, 0), ...calibrationTargets.map(([u, v]) => projectPoint(h, u, v))];
    const result = buildCalibration(points, width, height);
    assert.equal(result.x, points[0].x); assert.equal(result.y, points[0].y);
    assert.ok(distance(ellipsePoint(result, 0, 0), points[0]) < 1e-9);
    for (let i = 0; i < 120; i++) {
      const t = i * Math.PI / 60;
      assert.ok(distance(ellipsePoint(result, 1, t), projectPoint(h, Math.cos(t), Math.sin(t))) < 1e-7);
    }
    const image = { width, height, data: new Uint8ClampedArray(width * height * 4).fill(100) };
    const map = createBoardSampler(width, height, result);
    const values = sampleBoard(image, map);
    assert.ok(values.length > 20000);
    assert.ok(values.every(value => Math.abs(value - 100) < .01));
    const reference = createMotionReference(image, result);
    for (let i = 0; i < reference.points.length; i += 2) {
      assert.ok(reference.points[i] >= 0 && reference.points[i] < width);
      assert.ok(reference.points[i + 1] >= 0 && reference.points[i + 1] < height);
    }
  });
}
const points = [{ x: 240, y: 180 }, { x: 240, y: 60 }, { x: 340, y: 180 }, { x: 240, y: 300 }, { x: 140, y: 180 }];
test('Small tapping errors preserve the exact bull', () => {
  const adjusted = points.map(p => ({ ...p })); adjusted[2].y += 3;
  const result = buildCalibration(adjusted, width, height);
  assert.deepEqual(projectPoint(result.homography, 0, 0), adjusted[0]);
});
test('Invalid order, duplicate points, outside bull and tiny boards are rejected', () => {
  assert.throws(() => buildCalibration([points[0], points[1], points[3], points[2], points[4]], width, height));
  assert.throws(() => buildCalibration([points[0], points[1], points[1], points[3], points[4]], width, height));
  assert.throws(() => buildCalibration([{ x: 50, y: 50 }, ...points.slice(1)], width, height));
  assert.throws(() => buildCalibration(points.map(p => ({ x: 240 + (p.x - 240) * .05, y: 180 + (p.y - 180) * .05 })), width, height));
  assert.throws(() => buildCalibration(points.slice(1), width, height));
});
test('Four wrong rim points cannot silently move the bull to fit', () => {
  assert.throws(() => buildCalibration([{ x: 295, y: 220 }, ...points.slice(1)], width, height));
});
