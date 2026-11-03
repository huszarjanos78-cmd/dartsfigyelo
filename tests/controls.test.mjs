import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

// Exercise the actual UI handlers without requiring a physical camera.
const source = readFileSync(new URL('../dist/app.js', import.meta.url), 'utf8').replace(/^import .*;\n/, '');
function app(score = 55, stable = 3) {
  const elements = new Map();
  const drawing = Object.fromEntries(['clearRect', 'save', 'restore', 'setLineDash', 'beginPath', 'ellipse', 'stroke', 'moveTo', 'lineTo'].map(name => [name, () => {}]));
  const element = id => {
    if (!elements.has(id)) elements.set(id, { style: {}, checked: false, dataset: {}, getContext: () => drawing });
    return elements.get(id);
  };
  const context = vm.createContext({ document: { getElementById: element, createElement: () => element('frame'), addEventListener() {} }, window: {}, navigator: {} });
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
test('Below 55%, the reason is displayed and the handler cannot start', () => {
  const { element, context } = app(54);
  assert.equal(element('lock').disabled, true);
  assert.match(element('lock-hint').textContent, /legalább 55%/);
  element('lock').onclick();
  assert.equal(vm.runInContext('mode', context), 'positioning');
});
test('A high score still needs a stable board', () => {
  const { element, context } = app(100, 2);
  assert.equal(element('lock').disabled, true);
  assert.match(element('lock-hint').textContent, /stabil/);
  element('lock').onclick();
  assert.equal(vm.runInContext('mode', context), 'positioning');
});
test('Missing board or stopped camera cannot start watching', () => {
  const { element, context } = app();
  vm.runInContext('candidate = null; renderControls();', context);
  assert.equal(element('lock').disabled, true);
  assert.match(element('lock-hint').textContent, /Keresem/);
  vm.runInContext('stream = null; renderControls();', context);
  assert.equal(element('lock').hidden, true);
  assert.equal(element('lock-hint').hidden, true);
});
test('Start-watching control and hint appear above the camera exactly once', () => {
  const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
  for (const id of ['lock', 'lock-hint', 'count']) {
    assert.equal(html.split(`id="${id}"`).length - 1, 1);
    assert.ok(html.indexOf(`id="${id}"`) < html.indexOf('id="camera"'));
  }
});
