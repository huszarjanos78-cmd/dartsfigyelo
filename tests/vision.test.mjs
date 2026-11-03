import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { detectBoard, placementQuality, createBoardSampler, sampleBoard, sameBoard, createMotionReference, estimateCameraShift, frameDifference, scoringRingEvidence } from '../dist/board-vision.mjs';
const require = createRequire(import.meta.url);
const cvModule = require('../dist/vendor/opencv.js');
const { cv } = await new Promise(resolve => cvModule.then(lib => resolve({ cv: lib })));

export function scene({ x = 240, y = 180, a = 145, b = 145, angle = 0, plain = false, empty = false, brightness = 1, surround = 1, surroundShade = 65, dart = false, stripedSurround = false } = {}) {
  const width = 480, height = 360, data = new Uint8ClampedArray(width * height * 4);
  for (let py = 0; py < height; py++) for (let px = 0; px < width; px++) {
    const dx = px - x, dy = py - y, c = Math.cos(angle), s = Math.sin(angle);
    const u = (dx * c + dy * s) / a, v = (-dx * s + dy * c) / b;
    const r = Math.hypot(u, v), theta = (Math.atan2(v, u) + Math.PI * 2) % (Math.PI * 2);
    const sector = Math.floor(theta * 20 / (2 * Math.PI)), even = sector % 2 === 0;
    let rgb = [150, 158, 163];
    if (!empty && r < surround) rgb = [surroundShade, surroundShade + 1, surroundShade + 3];
    if (!empty && stripedSurround && r >= 1 && r < surround) rgb = even ? [180, 180, 180] : [30, 30, 30];
    if (!empty && r < 1) {
      rgb = [24, 25, 24];
      if (!plain && r < 0.79) {
        rgb = even ? [223, 211, 177] : [25, 27, 23];
        if (r > 0.74 || r > 0.46 && r < 0.5 || r < 0.08) rgb = even ? [174, 32, 28] : [28, 119, 58];
        if (r < 0.035) rgb = [185, 35, 27];
        if (Math.min(...[0.035, 0.08, 0.46, 0.5, 0.74, 0.79].map(edge => Math.abs(r - edge))) < 0.004) rgb = [170, 170, 160];
      }
    }
    if (dart && u > 0.1 && u < 0.5 && v > 0.1 && v < 0.18) rgb = [8, 8, 8];
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
const narrowSurround = detectBoard(cv, scene({ a: 125, b: 90, surround: 1.1, angle: .3 }));
assert.ok(narrowSurround && Math.abs(narrowSurround.ellipse.a - 125) < 6, 'Even a nearby foam edge must not replace the dartboard rim');
for (const axisRatio of [1, .72]) {
  const image = scene({ a: 95, b: 95 * axisRatio, angle: .3, surround: 1.6, stripedSurround: true });
  const found = detectBoard(cv, image);
  assert.ok(found && found.ellipse.a > 95 * .7 && found.ellipse.a < 95 * 1.1, 'A misleading sector-like surround must be rejected');
  const board = { x: 240, y: 180, a: 95, b: 95 * axisRatio, angle: .3 };
  assert.ok(scoringRingEvidence(image, board) >= .22, 'The real double and triple rings must pass');
  assert.ok(scoringRingEvidence(image, { ...board, a: board.a * 1.6, b: board.b * 1.6 }) < .22, 'Foam must fail ring-position validation even with sector texture');
}
const missingTriple = scene();
for (let y = 0; y < missingTriple.height; y++) for (let x = 0; x < missingTriple.width; x++) {
  const radius = Math.hypot(x - 240, y - 180) / 145;
  if (radius < .4 || radius > .55) continue;
  const i = (y * missingTriple.width + x) * 4;
  const value = missingTriple.data[i] * .299 + missingTriple.data[i + 1] * .587 + missingTriple.data[i + 2] * .114;
  missingTriple.data[i] = missingTriple.data[i + 1] = missingTriple.data[i + 2] = value;
}
assert.equal(detectBoard(cv, missingTriple), null, 'A single coloured ring must not validate an outline');
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
for (const degrees of [35, 45, 50]) {
  for (const rotation of [0, Math.PI / 2, 0.4]) {
    const b = 145 * Math.cos(degrees * Math.PI / 180);
    const image = scene({ b, angle: rotation });
    const result = detectBoard(cv, image);
    assert.ok(result, `${degrees}-degree side view must be detected at rotation ${rotation}`);
    assert.ok(Math.abs(result.ellipse.a - 145) < 12 && Math.abs(result.ellipse.b - b) < 12, 'Side-view outline must match');
    assert.ok(result.quality.score >= 55, 'Supported side view must allow watching');
    assert.ok(!result.quality.tips.some(tip => tip.includes('szembe')), 'Side view must not request a frontal camera');
    if (degrees === 45) assert.ok(result.quality.score >= 75, 'A well-framed 45-degree view must be rated good');
  }
}
const referenceEllipse = { x: 240, y: 180, a: 145, b: 145, angle: 0 };
const reference = sampleBoard(scene(), createBoardSampler(480, 360, referenceEllipse));
for (const rotation of [0, Math.PI / 2, 0.4]) {
  const e = { ...referenceEllipse, b: 145 * Math.SQRT1_2, angle: rotation };
  const image = scene({ b: e.b, angle: rotation });
  const map = createBoardSampler(480, 360, e), normalized = sampleBoard(image, map);
  assert.equal(normalized.length, reference.length, 'Normalized sampling area must be independent of side view');
  const error = normalized.reduce((sum, v, i) => sum + Math.abs(v - reference[i]), 0) / reference.length;
  assert.ok(error < 12, `Rectified board must match frontal board: error ${error}`);
  assert.deepEqual(sampleBoard(image, map), normalized, 'A stationary image must produce no artificial changes');
  const hit = sampleBoard(scene({ b: e.b, angle: rotation, dart: true }), map);
  assert.ok(frameDifference(hit, normalized).ratio > .0035, 'Noise filtering must preserve a real dart-shaped change');
  const meanChange = hit.reduce((sum, value, i) => sum + value - normalized[i], 0) / hit.length;
  const changeRatio = hit.reduce((sum, value, i) => sum + (Math.abs(value - normalized[i] - meanChange) > 24 ? 1 : 0), 0) / hit.length;
  assert.ok(changeRatio > 0.0035 && changeRatio < 0.14, 'A persistent dart-shaped change in a side view must cross the normal detection threshold');
}
// Pinhole projection of a 45 cm board at about 1 m and a 45-degree side angle.
// Unlike simple ellipse scaling, this includes the near/far perspective difference.
for (const side of [-1, 1]) {
  const image = scene(), src = cv.matFromImageData(image), dst = new cv.Mat();
  const k = side * Math.sin(Math.PI / 4) * 0.225 / 145, c = Math.SQRT1_2;
  const matrix = cv.matFromArray(3, 3, cv.CV_64F, [c + 240 * k, 0, 240 * (1 - 240 * k - c), 180 * k, 1, -180 * k * 240, k, 0, 1 - 240 * k]);
  try {
    cv.warpPerspective(src, dst, matrix, new cv.Size(480, 360), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(150, 158, 163, 255));
    const result = detectBoard(cv, { width: 480, height: 360, data: new Uint8ClampedArray(dst.data) });
    assert.ok(result, 'A 1 m, 45-degree perspective view must be found from either side');
    assert.ok(result.quality.score >= 55, 'Perspective view must allow watching');
  } finally { src.delete(); dst.delete(); matrix.delete(); }
}
const e = { ...referenceEllipse, b: 100 };
assert.equal(sameBoard(e, { ...e, angle: 0.35 }), false, 'Rotating an oblique camera must require recalibration');
assert.equal(sameBoard(e, { ...e, angle: Math.PI }), true, 'Equivalent ellipse angles must not trigger recalibration');
assert.throws(() => sampleBoard({ width: 240, height: 180 }, createBoardSampler(480, 360, e)), /dimensions/, 'Changed frame dimensions must not reuse an old sampling map');
const steady = scene({ b: 100, angle: .4 });
const steadyEllipse = { ...referenceEllipse, b: 100, angle: .4 };
const motionReference = createMotionReference(steady, steadyEllipse);
const sampler = createBoardSampler(480, 360, steadyEllipse);
const steadyValues = sampleBoard(steady, sampler);
for (const [dx, dy] of [[1, 0], [-2, 1], [3, -3], [0.5, -0.75]]) {
  const moved = scene({ x: 240 + dx, y: 180 + dy, b: 100, angle: .4 });
  const shift = estimateCameraShift(moved, motionReference);
  assert.ok(Math.abs(shift.x - dx) <= .5 && Math.abs(shift.y - dy) <= .5, `Small camera shift must be recovered: ${JSON.stringify(shift)}`);
  const corrected = sampleBoard(moved, sampler, shift.x, shift.y);
  const delta = frameDifference(corrected, steadyValues);
  assert.ok(delta.ratio < .0035 && delta.mean < 2.8, `Compensated jitter must neither count nor pause: ${dx},${dy}: ${JSON.stringify(delta)}`);
}
const dartShift = estimateCameraShift(scene({ b: 100, angle: .4, dart: true }), motionReference);
assert.ok(Math.abs(dartShift.x) <= .25 && Math.abs(dartShift.y) <= .25, 'A local dart must not be mistaken for camera motion');
assert.ok(estimateCameraShift(scene({ b: 100, angle: .4, x: 260 }), motionReference).error > 10, 'Large uncorrectable movement must be rejected');
const shiftedHit = scene({ x: 242, y: 179, b: 100, angle: .4, dart: true });
const hitAlignment = estimateCameraShift(shiftedHit, motionReference);
assert.ok(frameDifference(sampleBoard(shiftedHit, sampler, hitAlignment.x, hitAlignment.y), steadyValues).ratio > .0035, 'A dart arriving with a small camera shift must remain detectable');
console.log(JSON.stringify({ checks: 116, frontal: front.quality.score, tilted: tilted.quality.score, small: small.quality.score, sharpness: [sharpQuality.details.sharpness, blurredQuality.details.sharpness] }));
