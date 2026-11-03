import { detectBullBoard } from './bull-vision.mjs?v=0.5';
import { sameBoard, createBoardSampler, sampleBoard, createMotionReference, estimateCameraShift, prepareMotionFrame, frameDifference, ellipsePoint } from './board-vision.mjs?v=0.5';

const $ = id => document.getElementById(id);
const video = $('video'), overlay = $('overlay'), ctx = overlay.getContext('2d');
const frame = document.createElement('canvas'), fc = frame.getContext('2d', { willReadFrequently: true });
const metrics = ['size', 'angle', 'sharpness', 'lighting', 'framing'];
let stream = null, cv, cvLoading, mode = 'off', candidate = null, locked = null;
let previousCandidate = null, stableBoards = 0, lostBoards = 0, baseline, previous, stableFrames = 0;
let count = 0, lastEvent = 0, timer, wake, lastScan = 0, recentHit = 0, generation = 0, boardSampler, motionReference;

function status(text, state = '') {
  $('status').textContent = text;
  $('dot').style.background = state === 'good' ? '#ccf279' : state === 'warn' ? '#ffcc78' : '#718086';
}
function speak(text) {
  if (!$('voice').checked || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'hu-HU'; speechSynthesis.speak(utterance);
}
function loadVision() {
  if (cv) return Promise.resolve();
  if (cvLoading) return cvLoading;
  cvLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timeout = setTimeout(() => reject(new Error('A táblafelismerő betöltése túl sokáig tart. Frissítsd az oldalt.')), 45000);
    script.src = 'vendor/opencv.js';
    script.onload = () => {
      const ready = lib => { cv = lib; clearTimeout(timeout); resolve(); };
      if (window.cv?.Mat) ready(window.cv);
      else if (typeof window.cv?.then === 'function') window.cv.then(ready);
      else { clearTimeout(timeout); reject(new Error('A táblafelismerő nem indítható. Frissítsd az oldalt.')); }
    };
    script.onerror = () => { clearTimeout(timeout); reject(new Error('A táblafelismerő nem töltődött be. Ellenőrizd az internetkapcsolatot.')); };
    document.head.append(script);
  }).catch(error => { cvLoading = null; throw error; });
  return cvLoading;
}
async function keepAwake() {
  try { if (!wake || wake.released) wake = await navigator.wakeLock?.request('screen'); } catch { /* Optional on iPhone. */ }
}
function resetComparison() { motionReference = null; baseline = null; previous = null; stableFrames = 0; lastEvent = 0; }
const recommendedStartQuality = 55;
function canStartWatching() {
  return !!stream && mode === 'positioning' && !!candidate;
}
function renderControls() {
  $('start').textContent = stream ? 'Kamera leállítása' : 'Kamera bekapcsolása ↗';
  $('lock').hidden = !stream || mode === 'watching' || mode === 'clearing';
  $('lock').disabled = !canStartWatching();
  $('lock-hint').hidden = $('lock').hidden;
  $('quality-panel').hidden = !cv;
  $('lock-hint').textContent = !candidate ? 'Keresem a piros bullt és a pontozó gyűrűket. A teljes tábla látszódjon.' :
    candidate.quality.score < recommendedStartQuality ? `Indítható · Kameraállás: ${candidate.quality.score}%. Gyenge képminőség: a jelzés bizonytalanabb lehet.` :
    `Indítható · Bull és gyűrűk megtalálva · ${candidate.quality.score}%. Ellenőrizd a célkeresztet, majd indítsd a figyelést.`;
  $('calibrate').hidden = !stream;
  $('calibrate').textContent = 'Tábla újrakeresése';
  $('reset').disabled = !stream || !locked || mode === 'positioning';
  $('reset').innerHTML = mode === 'clearing' ? 'Tábla üres, folytatás' : 'Nyilak kiszedése<br><small>Szünet / új kör</small>';
}
function showQuality(result) {
  const score = result?.quality.score ?? 0;
  $('quality').textContent = score + '%'; $('quality-bar').style.width = score + '%';
  $('quality-panel').dataset.level = score >= 75 ? 'good' : score >= 55 ? 'fair' : 'poor';
  $('quality-title').textContent = !result ? 'Tábla keresése' : score >= 75 ? 'Jó kameraállás' : score >= 55 ? 'Használható, még javítható' : 'Igazíts a telefon helyzetén';
  $('quality-tip').textContent = result ? result.quality.tips[0] : 'Mutasd a teljes táblát. A piros-zöld dupla- és triplagyűrű is látszódjon élesen.';
  for (const name of metrics) $('metric-' + name).textContent = result ? Math.round(result.quality.details[name] * 100) + '%' : '—';
}
function draw() {
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  const e = locked || candidate?.ellipse;
  if (!e) return;
  ctx.save(); ctx.strokeStyle = e.homography || (candidate?.quality.score ?? 0) >= 75 ? '#ccf279' : '#ffcc78'; ctx.lineWidth = 2.5;
  ctx.setLineDash(locked ? [] : [7, 5]);
  ctx.beginPath();
  if (e.homography) {
    for (let i = 0; i <= 120; i++) {
      const p = ellipsePoint(e, 1, i * Math.PI / 60);
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
  } else ctx.ellipse(e.x, e.y, e.a, e.b, e.angle, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(e.x - 8, e.y); ctx.lineTo(e.x + 8, e.y); ctx.moveTo(e.x, e.y - 8); ctx.lineTo(e.x, e.y + 8); ctx.stroke();
  ctx.restore();
}
function position() {
  mode = 'positioning'; locked = null; boardSampler = null; previousCandidate = null; candidate = null; stableBoards = 0; lostBoards = 0;
  count = 0; $('count').textContent = '0'; resetComparison(); showQuality(null); draw(); renderControls();
  status('Keresem a bull közepét és a dupla–tripla gyűrűket…');
}
function capture() {
  if (!video.videoWidth || !video.videoHeight) return null;
  const w = Math.round(480 * video.videoWidth / Math.max(video.videoWidth, video.videoHeight));
  const h = Math.round(480 * video.videoHeight / Math.max(video.videoWidth, video.videoHeight));
  if (frame.width !== w || frame.height !== h) {
    frame.width = overlay.width = w; frame.height = overlay.height = h;
    $('camera').style.aspectRatio = video.videoWidth + '/' + video.videoHeight;
    if (locked || candidate) { position(); status('A képarány megváltozott. Újrakeresem a táblát.', 'warn'); }
  }
  fc.drawImage(video, 0, 0, w, h); return fc.getImageData(0, 0, w, h);
}
function scanBoard(image) {
  const result = detectBullBoard(cv, image);
  if (mode === 'positioning') {
    stableBoards = result && sameBoard(result.ellipse, previousCandidate, 0.06) ? stableBoards + 1 : result ? 1 : 0;
    previousCandidate = result?.ellipse || null; candidate = result; showQuality(result); draw(); renderControls();
    status(!result ? 'Nem látom biztosan a bullt és a gyűrűket. Mutasd a teljes táblát élesen.' : 'A bull és a pontozó gyűrűk megvannak. Indíthatod a figyelést.', result?.quality.score >= recommendedStartQuality ? 'good' : 'warn');
  } else if (mode === 'watching') {
    if (result && sameBoard(locked, result.ellipse, 0.1)) { lostBoards = 0; candidate = result; showQuality(result); draw(); }
    else lostBoards++;
    if (lostBoards >= 3) { position(); status('A tábla eltűnt vagy a telefon elmozdult. Állítsd be újra a kamerát.', 'warn'); }
  }
}
function pixels(image, shift) {
  if (!boardSampler) boardSampler = createBoardSampler(image.width, image.height, locked);
  return sampleBoard(image, boardSampler, shift.x, shift.y);
}

const difference = frameDifference;

function watch(image) {
  image = prepareMotionFrame(image);
  if (!motionReference) motionReference = createMotionReference(image, locked);
  const shift = estimateCameraShift(image, motionReference);
  if (shift.error > 10) {
    previous = null; stableFrames = 0;
    status('A kamera elmozdult vagy a tábla takarásban van. Ha nem áll helyre, koppints a Tábla újrakeresése gombra.');
    return;
  }
  const values = pixels(image, shift); if (!values.length) return;
  if (!previous || previous.length !== values.length) { previous = values; return; }
  const motion = difference(values, previous); previous = values;
  if (motion.ratio > 0.004 || motion.mean > 2.8) { stableFrames = 0; status('Mozgás a táblánál. Várok a nyugodt képre…'); return; }
  if (++stableFrames < 10) return;
  if (!baseline) { baseline = values; status('Figyelek. Jöhet a dobás!', 'good'); return; }
  const delta = difference(values, baseline), threshold = [0.009, 0.006, 0.0035, 0.002, 0.0012][Number($('sensitivity').value) - 1];
  if (delta.ratio > 0.14) { status('Nagy változás. Ellenőrizd a táblát, majd indíts új kört.', 'warn'); return; }
  if (delta.ratio > threshold && Date.now() - lastEvent > 2200) {
    $('count').textContent = ++count; baseline = values; lastEvent = recentHit = Date.now(); stableFrames = 0;
    status('Nyíl érzékelve · ' + count + '. találat', 'good'); speak('Nyíl érzékelve');
  } else if (Date.now() - recentHit > 2500) status('Figyelek. Jöhet a dobás!', 'good');
}
function tick() {
  if (!stream || video.readyState < 2 || document.hidden || mode === 'clearing') return;
  try {
    const image = capture(); if (!image) return;
    const now = Date.now();
    if (cv && !locked?.homography && now - lastScan > (mode === 'positioning' ? 550 : 1400)) { lastScan = now; scanBoard(image); }
    if (mode === 'watching' && locked) watch(image);
  } catch (error) { console.error(error); position(); status('A képfeldolgozás megszakadt. Indítsd újra a kamerát.', 'warn'); }
}
function stop() {
  generation++; clearInterval(timer);
  const old = stream; stream = null; old?.getTracks().forEach(track => track.stop());
  video.srcObject = null; mode = 'off'; boardSampler = null; locked = candidate = previousCandidate = null;
  resetComparison(); stableBoards = 0; count = 0; $('count').textContent = '0';
  wake?.release().catch(() => {}); wake = null; $('placeholder').hidden = false; $('live').textContent = 'KAMERA KIKAPCSOLVA';
  showQuality(null); draw(); renderControls(); status('Kamera leállítva.');
}
$('start').onclick = async () => {
  if (stream) { stop(); return; }
  $('start').disabled = true; const request = ++generation;
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('A kamera HTTPS-címen, Safariban használható.');
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
    video.srcObject = stream; await video.play(); $('placeholder').hidden = true; $('live').textContent = '● ÉLŐ KAMERAKÉP';
    mode = 'loading'; renderControls();
    status('Az automatikus táblafelismerő betöltése…'); await loadVision();
    if (request !== generation || !stream) return;
    position(); capture(); timer = setInterval(tick, 140); keepAwake();
    stream.getVideoTracks()[0].addEventListener('ended', () => { if (stream) stop(); });
  } catch (error) {
    stop(); status(error.name === 'NotAllowedError' ? 'Engedélyezd a kamerát a Safari webhelybeállításaiban.' : error.name === 'NotFoundError' ? 'Nem található kamera.' : error.message || 'A kamera nem indítható.', 'warn');
  } finally { $('start').disabled = false; }
};
$('lock').onclick = () => {
  if (!canStartWatching()) return;
  locked = { ...candidate.ellipse }; boardSampler = null; mode = 'watching'; lostBoards = 0; resetComparison(); draw(); renderControls();
  status('Lépj ki a képből. Az üres tábla alaphelyzetét rögzítem…'); speak('Figyelés indítása');
};
$('calibrate').onclick = position;
$('reset').onclick = () => {
  if (!stream || !locked) return;
  if (mode !== 'clearing') { mode = 'clearing'; resetComparison(); status('Figyelés szünetel. Szedd ki a nyilakat, majd koppints a folytatásra.'); }
  else { count = 0; $('count').textContent = '0'; mode = 'watching'; lostBoards = 0; lastScan = 0; resetComparison(); status('Lépj ki a képből. Új alaphelyzet rögzítése…'); }
  renderControls();
};
$('sensitivity').oninput = () => { $('svalue').value = $('sensitivity').value; if (mode === 'watching') { resetComparison(); status('Érzékenység módosítva. Alaphelyzet rögzítése…'); } };
$('sound').onclick = () => speak('Nyíl érzékelve');
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && stream) { keepAwake(); position(); status('Visszatértél az alkalmazáshoz. Ellenőrizd a körvonalat, majd indítsd újra a figyelést.'); }
});
renderControls(); showQuality(null);
