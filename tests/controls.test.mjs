import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { frameDifference, buildCalibration, ellipsePoint } from '../dist/board-vision.mjs';

// Exercise the actual UI handlers without requiring a physical camera.
const source = readFileSync(new URL('../dist/app.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
function app(score = 55, stable = 3) {
  const elements = new Map();
  const drawing = Object.fromEntries(['clearRect', 'save', 'restore', 'setLineDash', 'beginPath', 'ellipse', 'stroke', 'moveTo', 'lineTo', 'arc', 'fillText'].map(name => [name, () => {}]));
  const element = id => {
    if (!elements.has(id)) elements.set(id, { style: {}, checked: false, dataset: {}, getContext: () => drawing });
    return elements.get(id);
  };
  const context = vm.createContext({ frameDifference, buildCalibration, ellipsePoint, document: { getElementById: element, createElement: () => element('frame'), addEventListener() {} }, window: {}, navigator: {} });
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
