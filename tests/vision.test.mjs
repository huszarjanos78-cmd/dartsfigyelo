import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { detectBoard, placementQuality } from '../dist/board-vision.mjs';
const require = createRequire(import.meta.url);
const cvModule = require('../dist/vendor/opencv.js');
const { cv } = await new Promise(resolve => cvModule.then(lib => resolve({ cv: lib })));

export function scene({ x = 240, y = 180, a = 145, b = 145, angle = 0, plain = false, empty = false, brightness = 1, surround = 1, surroundShade = 65 } = {}) {
  const width = 480, height = 360, data = new Uint8ClampedArray(width * height * 4);
  for (let py = 0; py < height; py++) for (let px = 0; px < width; px++) {
    const dx = px - x, dy = py - y, c = Math.cos(angle), s = Math.sin(angle);
    const u = (dx * c + dy * s) / a, v = (-dx * s + dy * c) / b;
    const r = Math.hypot(u, v), theta = (Math.atan2(v, u) + Math.PI * 2) % (Math.PI * 2);
    const sector = Math.floor(theta * 20 / (2 * Math.PI)), even = sector % 2 === 0;
    let rgb = [150, 158, 163];
    if (!empty && r < surround) rgb = [surroundShade, surroundShade + 1, surroundShade + 3];
    if (!empty && r < 1) {
      rgb = [24, 25, 24];
      if (!plain && r < 0.79) {
        rgb = even ? [223, 211, 177] : [25, 27, 23];
        if (r > 0.74 || r > 0.46 && r < 0.5 || r < 0.08) rgb = even ? [174, 32, 28] : [28, 119, 58];
        if (r < 0.035) rgb = [185, 35, 27];
        if (Math.min(...[0.035, 0.08, 0.46, 0.5, 0.74, 0.79].map(edge => Math.abs(r - edge))) < 0.004) rgb = [170, 170, 160];
      }
    }
    const i = (py * width + px) * 4;
    for (let k = 0; k < 3; k++) data[i + k] = rgb[k] * brightness;
    data[i + 3] = 255;
  }
  return { width, height, data };
}
function blurred(image, size = 19) {
  const src = cv.matFromImageData(image), dst = new cv.Mat();
  cv.GaussianBlur(src, dst, new cv.Size(size, size), 0);
  const result = { width: image.width, height: image.height, data: new Uint8ClampedArray(dst.data) };
  src.delete(); dst.delete(); return result;
}
function gray(image) {
  const out = new Uint8Array(image.width * image.height);
  for (let i = 0; i < out.length; i++) out[i] = image.data[i * 4] * .299 + image.data[i * 4 + 1] * .587 + image.data[i * 4 + 2] * .114;
  return out;
}
const front = detectBoard(cv, scene());
assert.ok(front, 'Frontal dartboard must be found');
assert.ok(Math.abs(front.ellipse.x - 240) < 8 && Math.abs(front.ellipse.y - 180) < 8, 'Center must match');
assert.ok(Math.abs(front.ellipse.a - 145) < 12, 'Outline must enclose the board, not only the bull');
assert.ok(front.quality.score >= 75, 'Good framing must receive a good placement score');
const tilted = detectBoard(cv, scene({ b: 90, angle: .4 }));
assert.ok(tilted, 'Tilted board must be found as an ellipse');
assert.ok(tilted.quality.score < front.quality.score, 'Tilt must lower the score');
const small = detectBoard(cv, scene({ a: 65, b: 65 }));
assert.ok(small, 'A small board should still provide positioning feedback');
assert.ok(small.quality.score <= 54, 'Small board must request a closer position before starting');
assert.equal(detectBoard(cv, scene({ empty: true })), null, 'Blank background must not be a board');
assert.equal(detectBoard(cv, scene({ plain: true })), null, 'A plain circle must not be a dartboard');
for (const surround of [1.25, 1.5, 1.75]) {
  for (const axisRatio of [1, 0.72]) {
    const image = scene({ a: 95, b: 95 * axisRatio, angle: 0.3, surround });
    const found = detectBoard(cv, image);
    assert.ok(found, `Board inside ${surround}x surround must be found (${axisRatio})`);
    assert.ok(Math.abs(found.ellipse.a - 95) < 10,
      `Must select board, not ${surround}x surround: radius ${found.ellipse.a}`);
    assert.ok(Math.abs(found.ellipse.b - 95 * axisRatio) < 10, 'Board minor axis must match');
  }
}
// A dark surround may hide the physical rim. The scoring boundary is a safe
// fallback, but the surrounding foam must never become the analysis region.
for (const axisRatio of [1, 0.72]) {
  const found = detectBoard(cv, scene({ a: 95, b: 95 * axisRatio, angle: 0.3, surround: 1.6, surroundShade: 42 }));
  assert.ok(found, 'Board must remain detectable against a dark surround');
  assert.ok(found.ellipse.a > 95 * 0.7 && found.ellipse.a < 95 * 1.1, 'Dark foam must not be selected');
  assert.ok(found.ellipse.b > 95 * axisRatio * 0.7 && found.ellipse.b < 95 * axisRatio * 1.1, 'Dark foam minor axis must not be selected');
}
const sharpQuality = placementQuality(gray(scene()), 480, 360, front.ellipse);
const blurredQuality = placementQuality(gray(blurred(scene())), 480, 360, front.ellipse);
assert.ok(blurredQuality.details.sharpness < sharpQuality.details.sharpness, 'Blur must lower sharpness');
assert.ok(placementQuality(gray(scene()), 480, 360, { ...front.ellipse, x: 40 }).score <= 44, 'Clipped board cannot be rated ready');
console.log(JSON.stringify({ checks: 36, frontal: front.quality.score, tilted: tilted.quality.score, small: small.quality.score, sharpness: [sharpQuality.details.sharpness, blurredQuality.details.sharpness] }));
