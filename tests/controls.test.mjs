import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { smallHitEvidence, confirmSmallHit } from '../dist/hit-evidence.mjs';
import { inspectBoardChange, looksLikeRemoval } from '../dist/retrieval-guard.mjs';
import { zoomCrop } from '../dist/camera-view.mjs';
import { createBoardSampler, sampleBoard, BOARD_OUTER_RADIUS, BOARD_SAMPLE_RADIUS, BOARD_SAMPLE_SIZE } from '../dist/board-vision.mjs';
import { frameDifference, buildCalibration, ellipsePoint, sameBoard } from '../dist/board-vision.mjs';

// Exercise the actual UI handlers without requiring a physical camera.
const source = readFileSync(new URL('../dist/app.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
function app(score = 55, stable = 3) {
  const elements = new Map();
  const drawing = Object.fromEntries(['clearRect', 'save', 'restore', 'setLineDash', 'beginPath', 'ellipse', 'stroke', 'moveTo', 'lineTo', 'arc', 'fillText'].map(name => [name, () => {}]));
  const element = id => {
    if (!elements.has(id)) elements.set(id, { style: {}, checked: false, dataset: {}, getContext: () => drawing });
    return elements.get(id);
  };
  const context = vm.createContext({ BOARD_OUTER_RADIUS, BOARD_SAMPLE_RADIUS, BOARD_SAMPLE_SIZE, smallHitEvidence, confirmSmallHit, inspectBoardChange, looksLikeRemoval, zoomCrop, frameDifference, buildCalibration, ellipsePoint, sameBoard, document: { getElementById: element, createElement: () => element('frame'), addEventListener() {} }, window: {}, navigator: {} });
  vm.runInContext(source, context);
  vm.runInContext(`stream = {}; mode = 'positioning'; stableBoards = ${stable}; candidate = { ellipse: { x: 100, y: 100, a: 80, b: 60, angle: 0 }, quality: { score: ${score} } }; renderControls();`, context);
  return { element, context };
}

for (const score of [55, 74, 86, 99, 100]) {
  test(`Stable board can start watching at ${score}%`, () => {
    const { element, context } = app(score);
    assert.equal(element('lock').disabled, false);
    assert.equal(element('lock').hidden, false);
    assert.match(element('lock-hint').textContent, /Indítható/);
    element('lock').onclick();
    assert.equal(vm.runInContext('mode', context), 'watching');
    assert.equal(element('lock').hidden, true);
    assert.equal(element('lock-hint').hidden, true);
  });
}
test('Below 55%, a warning is displayed but manual watching can start', () => {
  const { element, context } = app(54);
  assert.equal(element('lock').disabled, false);
  assert.match(element('lock-hint').textContent, /Gyenge képminőség/);
  element('lock').onclick();
  assert.equal(vm.runInContext('mode', context), 'watching');
});
test('A freshly found outline can be locked without waiting for three matches', () => {
  const { element, context } = app(74, 1);
  assert.equal(element('lock').disabled, false);
  assert.match(element('lock-hint').textContent, /Indítható/);
  element('lock').onclick();
  assert.equal(vm.runInContext('mode', context), 'watching');
});
test('Missing board or stopped camera cannot start watching', () => {
  const { element, context } = app();
  vm.runInContext('candidate = null; renderControls();', context);
  assert.equal(element('lock').disabled, true);
  assert.match(element('lock-hint').textContent, /Keresem/);
  element('lock').onclick();
  assert.equal(vm.runInContext('mode', context), 'positioning');
  vm.runInContext('stream = null; renderControls();', context);
  assert.equal(element('lock').hidden, true);
  assert.equal(element('lock-hint').hidden, true);
});
test('Manual start captures a baseline and counts a persistent change', () => {
  const { element, context } = app(44, 1);
  context.createBoardSampler = () => ({});
  context.sampleBoard = image => image.values;
  context.createBoardSampler = () => ({});
  context.prepareMotionFrame = image => image;
  context.createMotionReference = () => ({});
  context.estimateCameraShift = () => ({ x: 0, y: 0, error: 0 });
  element('sensitivity').value = '3';
  element('lock').onclick();
  vm.runInContext(`
    const emptyFrame = { values: new Float32Array(1000).fill(100) };
    for (let i = 0; i < 12; i++) watch(emptyFrame);
  `, context);
  assert.match(element('status').textContent, /Figyelek/);
  vm.runInContext(`
    const hitFrame = { values: new Float32Array(1000).fill(100) };
    hitFrame.values.fill(160, 0, 10);
    for (let i = 0; i < 12; i++) watch(hitFrame);
  `, context);
  assert.equal(vm.runInContext('count', context), 1);
  assert.match(element('status').textContent, /Nyíl érzékelve/);
});
test('Start-watching control and hint appear above the camera exactly once', () => {
  const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
  for (const id of ['lock', 'lock-hint', 'count']) {
    assert.equal(html.split(`id="${id}"`).length - 1, 1);
    assert.ok(html.indexOf(`id="${id}"`) < html.indexOf('id="camera"'));
  }
});
test('A locked automatic bull projection is not overwritten by rescanning', () => {
  const { element, context } = app();
  vm.runInContext('candidate.automatic = true; candidate.ellipse.homography = [80,0,100,0,60,100,0,0];', context);
  element('lock').onclick();
  element('video').readyState = 2;
  context.detectBullBoard = () => { throw new Error('Locked geometry must not be rescanned'); };
  let frames = 0;
  context.watch = () => { frames++; };
  context.capture = () => ({ width: 480, height: 360 });
  vm.runInContext('cv = {}; lastScan = 0; tick();', context);
  assert.equal(frames, 1);
  assert.equal(vm.runInContext('mode', context), 'watching');
  assert.equal(vm.runInContext('locked.x', context), 100);
});

test('A broad occlusion pauses without counting a person', () => {
  const { element, context } = app();
  context.createBoardSampler = () => ({});
  context.prepareMotionFrame = image => image;
  context.createMotionReference = () => ({});
  context.estimateCameraShift = () => ({ x: 0, y: 0, error: 0 });
  context.sampleBoard = image => image.values;
  element('sensitivity').value = '3'; element('lock').onclick();
  vm.runInContext(`
    const empty = { values: new Float32Array(1000).fill(100) };
    for (let i = 0; i < 12; i++) watch(empty);
    const person = { values: new Float32Array(1000).fill(100) };
    person.values.fill(160, 0, 100);
    for (let i = 0; i < 3; i++) watch(person);
  `, context);
  assert.equal(vm.runInContext('mode', context), 'clearing');
  assert.equal(vm.runInContext('count', context), 0);
  assert.equal(element('reset').dataset.state, 'paused');
});
test('Removing a counted dart pauses instead of adding another hit', () => {
  const { element, context } = app();
  context.createBoardSampler = () => ({});
  context.prepareMotionFrame = image => image;
  context.createMotionReference = () => ({});
  context.estimateCameraShift = () => ({ x: 0, y: 0, error: 0 });
  context.sampleBoard = image => image.values;
  element('sensitivity').value = '3'; element('lock').onclick();
  vm.runInContext(`
    const empty = { values: new Float32Array(1000).fill(100) };
    const hit = { values: new Float32Array(1000).fill(100) }; hit.values.fill(160, 0, 10);
    for (let i = 0; i < 12; i++) watch(empty);
    for (let i = 0; i < 12; i++) watch(hit);
    lastEvent = 0;
    for (let i = 0; i < 12; i++) watch(empty);
  `, context);
  assert.equal(vm.runInContext('mode', context), 'clearing');
  assert.equal(vm.runInContext('count', context), 1);
  element('reset').onclick();
  assert.equal(vm.runInContext('count', context), 0);
  assert.equal(vm.runInContext('mode', context), 'watching');
});
test('Changing zoom pauses and redetects while preserving the count', () => {
  const { element, context } = app(); element('lock').onclick();
  vm.runInContext('count = 2;', context);
  element('zoom').value = '2'; element('zoom').oninput();
  assert.equal(vm.runInContext('mode', context), 'positioning');
  assert.equal(vm.runInContext('locked', context), null);
  assert.equal(vm.runInContext('count', context), 2);
  assert.equal(element('zoom-value').textContent, '2.0×');
  assert.equal(element('lock').disabled, true);
});
test('A cropped physical board edge displays a zoom warning without blocking start', () => {
  const { element, context } = app(74);
  element('overlay').width = element('overlay').height = 200;
  vm.runInContext('renderControls();', context);
  assert.match(element('lock-hint').textContent, /külső pereme kilóg/);
  assert.equal(element('lock').disabled, false);
  element('overlay').width = element('overlay').height = 300;
  vm.runInContext('candidate.ellipse.x = candidate.ellipse.y = 150; renderControls();', context);
  assert.match(element('lock-hint').textContent, /Indítható/);
});

function simulatedRound() {
  const state = app(), { element, context } = state;
  context.createBoardSampler = () => ({});
  context.prepareMotionFrame = image => image;
  context.createMotionReference = () => ({});
  context.estimateCameraShift = () => ({ x: 0, y: 0, error: 0 });
  context.sampleBoard = image => image.values;
  element('sensitivity').value = '3'; element('lock').onclick();
  vm.runInContext(`
    const empty = { values: new Float32Array(1000).fill(100) };
    const first = { values: new Float32Array(1000).fill(100) }; first.values.fill(160, 0, 10);
    const second = { values: new Float32Array(1000).fill(100) }; second.values.fill(160, 0, 20);
    const person = { values: new Float32Array(1000).fill(100) }; person.values.fill(160, 0, 100);
    for (let i = 0; i < 12; i++) watch(empty);
    for (let i = 0; i < 12; i++) watch(first);
  `, context);
  return state;
}
test('Complete retrieval resets and resumes without a button, then counts the next round', () => {
  const { element, context } = simulatedRound();
  vm.runInContext('for (let i = 0; i < 12; i++) watch(empty);', context);
  assert.equal(vm.runInContext('mode', context), 'clearing');
  vm.runInContext('for (let i = 0; i < 9; i++) recoverRound(empty);', context);
  assert.equal(vm.runInContext('count', context), 1, 'Do not clear on a fleeting empty-looking frame');
  vm.runInContext('recoverRound(empty);', context);
  assert.equal(vm.runInContext('mode', context), 'watching');
  assert.equal(element('count').textContent, '0');
  assert.match(element('status').textContent, /Új kör/);
  vm.runInContext('for (let i = 0; i < 12; i++) watch(first);', context);
  assert.equal(vm.runInContext('count', context), 1);
});
test('Occlusion and partial retrieval cannot reset the round', () => {
  const { context } = simulatedRound();
  vm.runInContext(`lastEvent = 0; for (let i = 0; i < 12; i++) watch(second);
    for (let i = 0; i < 3; i++) watch(person);
    for (let i = 0; i < 15; i++) recoverRound(person);
    for (let i = 0; i < 15; i++) recoverRound(first);`, context);
  assert.equal(vm.runInContext('count', context), 2);
  assert.equal(vm.runInContext('mode', context), 'clearing');
  vm.runInContext('for (let i = 0; i < 10; i++) recoverRound(empty);', context);
  assert.equal(vm.runInContext('count', context), 0);
  assert.equal(vm.runInContext('mode', context), 'watching');
});
test('Automatic resume requires the bull and scoring ring to be visible', () => {
  const { context } = simulatedRound();
  vm.runInContext('for (let i = 0; i < 3; i++) watch(person); cv = {};', context);
  context.detectBullBoard = () => null;
  vm.runInContext('for (let i = 0; i < 12; i++) recoverRound(empty);', context);
  assert.equal(vm.runInContext('mode', context), 'clearing');
  assert.equal(vm.runInContext('count', context), 1);
  context.detectBullBoard = () => ({ ellipse: { x: 100, y: 100, a: 80, b: 60, angle: 0 } });
  vm.runInContext('for (let i = 0; i < 10; i++) recoverRound(empty);', context);
  assert.equal(vm.runInContext('mode', context), 'watching');
});
test('A small colour-only hit is confirmed, not double-counted, and must be removed before auto-reset', () => {
  const width = 192, height = 192, data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) { data[i] = data[i + 1] = data[i + 2] = 100; data[i + 3] = 255; }
  const changed = new Uint8ClampedArray(data);
  // Nearly identical luminance, visibly different colour: the old grayscale
  // difference cannot detect this small flight.
  for (let y = 110; y < 130; y++) for (let x = 110; x < 113; x++) changed.set([20, 130, 156], (y * width + x) * 4);
  const map = createBoardSampler(width, height, { x: 96, y: 96, a: 90, b: 90, angle: 0 });
  const empty = sampleBoard({ width, height, data }, map), hit = sampleBoard({ width, height, data: changed }, map);
  assert.equal(frameDifference(hit, empty).ratio, 0);
  assert.equal(looksLikeRemoval(empty, hit, empty), true, 'A colour-only dart removal must not become a new hit');
  const { element, context } = app();
  context.createBoardSampler = () => ({}); context.prepareMotionFrame = image => image;
  context.createMotionReference = () => ({}); context.estimateCameraShift = () => ({ x: 0, y: 0, error: 0 });
  context.sampleBoard = image => image.values;
  context.emptyImage = { values: empty }; context.hitImage = { values: hit };
  element('sensitivity').value = '3'; element('lock').onclick();
  vm.runInContext('for(let i=0;i<12;i++)watch(emptyImage); watch(hitImage); watch(emptyImage); watch(hitImage); watch(hitImage);', context);
  assert.equal(vm.runInContext('count', context), 0, 'One-frame changes must not count');
  vm.runInContext('watch(hitImage); for(let i=0;i<15;i++)watch(hitImage);', context);
  assert.equal(vm.runInContext('count', context), 1);
  vm.runInContext("pauseForRetrieval('Takarás'); for(let i=0;i<15;i++)recoverRound(hitImage);", context);
  assert.equal(vm.runInContext('mode', context), 'clearing', 'A remaining fine hit must prevent premature reset');
  vm.runInContext('for(let i=0;i<10;i++)recoverRound(emptyImage);', context);
  assert.equal(vm.runInContext('mode', context), 'watching');
  assert.equal(vm.runInContext('count', context), 0);
});

test('Three removed darts reset the round even below the current hit threshold', () => {
  const { element, context } = app();
  context.createBoardSampler = () => ({});
  context.prepareMotionFrame = image => image;
  context.createMotionReference = () => ({});
  context.estimateCameraShift = () => ({ x: 0, y: 0, error: 0 });
  context.sampleBoard = image => image.values;
  element('sensitivity').value = '5';
  element('lock').onclick();
  vm.runInContext(`
    const empty = { values: new Float32Array(1000).fill(100) };
    const hits = [2, 4, 6].map(end => {
      const values = empty.values.slice();
      values.fill(180, 0, end);
      return { values };
    });
    for (let i = 0; i < 12; i++) watch(empty);
    for (const hit of hits) {
      lastEvent = 0;
      for (let i = 0; i < 12; i++) watch(hit);
    }
  `, context);
  assert.equal(element('count').textContent, 3);
  element('sensitivity').value = '1';
  element('sensitivity').oninput();
  vm.runInContext('for (let i = 0; i < 12; i++) watch(empty);', context);
  assert.equal(element('reset').dataset.state, 'paused');
  vm.runInContext('for (let i = 0; i < 9; i++) recoverRound(empty);', context);
  assert.equal(element('count').textContent, 3);
  vm.runInContext('recoverRound(empty);', context);
  assert.equal(element('reset').dataset.state, 'watching');
  assert.equal(element('count').textContent, '0');
  element('sensitivity').value = '5';
  element('sensitivity').oninput();
  vm.runInContext('for (let i = 0; i < 12; i++) watch(hits[0]);', context);
  assert.equal(element('count').textContent, 1);
});
