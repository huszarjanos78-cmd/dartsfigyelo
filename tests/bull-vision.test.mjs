import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { scene } from './scene.mjs';
import { detectBullBoard, bullProjection } from '../dist/bull-vision.mjs';
import { ellipsePoint } from '../dist/board-vision.mjs';
const require = createRequire(import.meta.url);
const module = require('../dist/vendor/opencv.js');
const { cv } = await new Promise(resolve => module.then(cv => resolve({ cv })));

for (const angle of [0, .4, Math.PI / 2]) {
  test(`Automatic bull anchor and scoring boundary at angle ${angle}`, () => {
    const image = scene({ b: 105, angle });
    const result = detectBullBoard(cv, image);
    assert.ok(result, 'The bull and two rings must be found');
    assert.ok(Math.hypot(result.bull.x - 240, result.bull.y - 180) < 3);
    assert.ok(Math.abs(result.ellipse.a - 145 * .79) < 12, 'Outline must follow scoring ring, not physical board rim');
    assert.deepEqual(ellipsePoint(result.ellipse, 0, 0), result.bull);
  });
}
test('A green surround cannot replace the double ring', () => {
  const image = scene({ a: 110, b: 85, surround: 1.8, angle: .3 });
  for (let i = 0; i < image.data.length; i += 4) {
    if (image.data[i] === 65 && image.data[i + 1] === 66) {
      image.data[i] = 8; image.data[i + 1] = 110; image.data[i + 2] = 65;
    }
  }
  const result = detectBullBoard(cv, image);
  assert.ok(result);
  assert.ok(Math.abs(result.ellipse.a - 110 * .79) < 12);
  assert.ok(Math.hypot(result.bull.x - 240, result.bull.y - 180) < 3);
});
test('Plain circles and a scene without the red bull cannot be accepted', () => {
  assert.equal(detectBullBoard(cv, scene({ plain: true })), null);
  const image = scene();
  for (let y = 165; y <= 195; y++) for (let x = 225; x <= 255; x++) {
    const i = (y * image.width + x) * 4;
    image.data[i] = image.data[i + 1] = image.data[i + 2] = 25;
  }
  assert.equal(detectBullBoard(cv, image), null, 'Missing bull must not fall back to ellipse centre');
});
test('Projective bull anchor preserves the detected conic boundary', () => {
  const e = { x: 230, y: 175, a: 120, b: 80, angle: .4 };
  const bull = { x: 240, y: 180 }, result = bullProjection(e, bull);
  assert.deepEqual(ellipsePoint(result, 0, 0), bull);
  for (let i = 0; i < 120; i++) {
    const p = ellipsePoint(result, 1, i * Math.PI / 60);
    const dx = p.x - e.x, dy = p.y - e.y;
    const u = (dx * Math.cos(e.angle) + dy * Math.sin(e.angle)) / e.a;
    const v = (-dx * Math.sin(e.angle) + dy * Math.cos(e.angle)) / e.b;
    assert.ok(Math.abs(u * u + v * v - 1) < 1e-9);
  }
  assert.equal(bullProjection(e, { x: 400, y: 300 }), null);
});
for (const side of [-1, 1]) {
  test(`Automatic recognition in a 1 m / 45-degree perspective, side ${side}`, () => {
    const image = scene(), src = cv.matFromImageData(image), dst = new cv.Mat();
    const k = side * Math.sin(Math.PI / 4) * .225 / 145, c = Math.SQRT1_2;
    const h = cv.matFromArray(3, 3, cv.CV_64F, [c + 240 * k, 0, 240 * (1 - 240 * k - c), 180 * k, 1, -180 * k * 240, k, 0, 1 - 240 * k]);
    try {
      cv.warpPerspective(src, dst, h, new cv.Size(480, 360), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(150, 158, 163, 255));
      const result = detectBullBoard(cv, { width: 480, height: 360, data: new Uint8ClampedArray(dst.data) });
      assert.ok(result);
      assert.ok(Math.hypot(result.bull.x - 240, result.bull.y - 180) < 3);
      assert.deepEqual(ellipsePoint(result.ellipse, 0, 0), result.bull);
    } finally { src.delete(); dst.delete(); h.delete(); }
  });
}
