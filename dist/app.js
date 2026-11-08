import { smallHitEvidence, confirmSmallHit } from './hit-evidence.mjs?v=0.9.1';
import { zoomCrop } from './camera-view.mjs?v=0.9.1';
import { inspectBoardChange, looksLikeRemoval } from './retrieval-guard.mjs?v=0.9.1';
import { detectBullBoard } from './bull-vision.mjs?v=0.9.1';
import { sameBoard, createBoardSampler, sampleBoard, createMotionReference, estimateCameraShift, prepareMotionFrame, frameDifference, ellipsePoint, BOARD_OUTER_RADIUS, BOARD_SAMPLE_RADIUS, BOARD_SAMPLE_SIZE } from './board-vision.mjs?v=0.9.1';

const $ = id => document.getElementById(id);
const video = $('video'), overlay = $('overlay'), ctx = overlay.getContext('2d');
const frame = document.createElement('canvas'), fc = frame.getContext('2d', { willReadFrequently: true });
const preview = $('preview'), pc = preview.getContext('2d');
let zoom = 1, zoomFocus = { x: .5, y: .5 }, previewRequest, emptyBaseline = null, occlusionFrames = 0, recovery = null, smallCandidate = null;
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
function resetComparison() { smallCandidate = null; recovery = null; emptyBaseline = null; occlusionFrames = 0; motionReference = null; baseline = null; previous = null; stableFrames = 0; lastEvent = 0; }
const recommendedStartQuality = 55;
function canStartWatching() {
  return !!stream && mode === 'positioning' && !!candidate;
}
function renderControls() {
  $('zoom').disabled = !stream;
  $('reset').dataset.state = mode === 'clearing' ? 'paused' : 'watching';
  $('start').textContent = stream ? 'Kamera leállítása' : 'Kamera bekapcsolása ↗';
  $('lock').hidden = !stream || mode === 'watching' || mode === 'clearing';
  $('lock').disabled = !canStartWatching();
  $('lock-hint').hidden = $('lock').hidden;
  $('lock-hint').textContent = !candidate ? 'Keresem a piros bullt és a pontozó gyűrűket. A teljes tábla látszódjon.' :
    candidate.quality.score < recommendedStartQuality ? 'Indítható. Gyenge képminőség: a jelzés bizonytalanabb lehet.' :
    'Indítható · Bull és gyűrűk megtalálva. Ellenőrizd a célkeresztet, majd indítsd a figyelést.';
  if (candidate && !wholeBoardVisible(candidate.ellipse))
    $('lock-hint').textContent = 'A tábla külső pereme kilóg a képből. Csökkentsd a nagyítást, hogy minden nyíl látszódjon.';
  $('calibrate').hidden = !stream;
  $('calibrate').textContent = 'Tábla újrakeresése';
  $('reset').disabled = !stream || !locked || mode === 'positioning';
  $('reset').innerHTML = mode === 'clearing' ? 'Automatikus új kör<br><small>Várom az üres táblát · kézi folytatás</small>' : 'Nyilak kiszedése<br><small>Szünet / új kör</small>';
}
function showQuality(result) {
  const score = result?.quality.score ?? 0;
  $('quality').textContent = score + '%';
  $('quality').ariaLabel = 'Kameraállás becslése: ' + score + '%';
  $('quality').dataset.level = score >= 75 ? 'good' : score >= 55 ? 'fair' : 'poor';
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
      const p = ellipsePoint(e, BOARD_OUTER_RADIUS, i * Math.PI / 60);
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
  } else ctx.ellipse(e.x, e.y, e.a * BOARD_OUTER_RADIUS, e.b * BOARD_OUTER_RADIUS, e.angle, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(e.x - 8, e.y); ctx.lineTo(e.x + 8, e.y); ctx.moveTo(e.x, e.y - 8); ctx.lineTo(e.x, e.y + 8); ctx.stroke();
  ctx.restore();
}
function wholeBoardVisible(e) {
  if (!overlay.width || !overlay.height) return true;
  for (let i = 0; i < 120; i++) {
    const p = ellipsePoint(e, BOARD_OUTER_RADIUS, i * Math.PI / 60);
    if (p.x < 0 || p.x >= overlay.width || p.y < 0 || p.y >= overlay.height) return false;
  }
  return true;
}
function position(options = {}) {
  mode = 'positioning'; locked = null; boardSampler = null; previousCandidate = null; candidate = null; stableBoards = 0; lostBoards = 0;
  if (!options.preserveCount) { count = 0; $('count').textContent = '0'; }
  resetComparison(); showQuality(null); draw(); renderControls();
  status('Keresem a bull közepét és a dupla–tripla gyűrűket…');
}
function capture() {
  if (!video.videoWidth || !video.videoHeight) return null;
  const analysisSize = Math.min(720, Math.max(video.videoWidth, video.videoHeight) / zoom);
  const w = Math.round(analysisSize * video.videoWidth / Math.max(video.videoWidth, video.videoHeight));
  const h = Math.round(analysisSize * video.videoHeight / Math.max(video.videoWidth, video.videoHeight));
  if (frame.width !== w || frame.height !== h) {
    frame.width = overlay.width = w; frame.height = overlay.height = h;
    $('camera').style.aspectRatio = video.videoWidth + '/' + video.videoHeight;
    if (locked || candidate) { position(); status('A képarány megváltozott. Újrakeresem a táblát.', 'warn'); }
  }
  const crop = zoomCrop(video.videoWidth, video.videoHeight, zoom, zoomFocus);
  fc.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, w, h); return fc.getImageData(0, 0, w, h);
}
function drawPreview() {
  if (!stream) return;
  if (video.readyState >= 2 && video.videoWidth && video.videoHeight) {
    const width = Math.min(1280, video.videoWidth), height = Math.round(width * video.videoHeight / video.videoWidth);
    if (preview.width !== width || preview.height !== height) { preview.width = width; preview.height = height; }
    const crop = zoomCrop(video.videoWidth, video.videoHeight, zoom, zoomFocus);
    pc.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
  }
  previewRequest = requestAnimationFrame(drawPreview);
}
function pauseForRetrieval(text) {
  const saved = emptyBaseline && motionReference ? { empty: emptyBaseline, reference: motionReference, stable: 0 } : null;
  mode = 'clearing'; resetComparison(); recovery = saved; renderControls();
  status(text + ' Nem számolok. Az üres tábla visszatérésekor automatikusan új kört kezdek.', 'warn');
}
function matchesEmptyBoard(values, empty) {
  if (!empty || !values.length || values.length !== empty.length) return false;
  const delta = difference(values, empty);
  return delta.ratio <= .001 && delta.mean <= 1.5 && !smallHitEvidence(values, empty, 5);
}
function recoverRound(original) {
  if (!recovery || !locked || mode !== 'clearing') return;
  const image = prepareMotionFrame(original), shift = estimateCameraShift(image, recovery.reference);
  if (shift.error > 10) {
    recovery.stable = 0;
    status('Az üres táblát nem tudom a korábbi képhez igazítani. Ellenőrizd a kamerát és a takarást.', 'warn');
    return;
  }
  const values = pixels(image, shift);
  if (!matchesEmptyBoard(values, recovery.empty)) {
    recovery.stable = 0;
    status('Nyílkiszedés folyamatban. Várom, hogy a tábla újra üres és takarásmentes legyen.', 'warn');
    return;
  }
  if (++recovery.stable < 10) return;
  if (cv) {
    const visible = detectBullBoard(cv, original);
    if (!visible || !sameBoard(locked, visible.ellipse, .15)) {
      recovery.stable = 0;
      status('Az új körhöz látnom kell a bullt és a teljes pontozó gyűrűt.', 'warn');
      return;
    }
  }
  const empty = recovery.empty, reference = recovery.reference;
  resetComparison(); motionReference = reference; emptyBaseline = empty; baseline = previous = values;
  mode = 'watching'; count = 0; $('count').textContent = '0'; renderControls();
  status('Nyilak kiszedve. Új kör — figyelek!', 'good'); speak('Új kör');
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
  if (!boardSampler) boardSampler = createBoardSampler(image.width, image.height, locked, BOARD_SAMPLE_SIZE, BOARD_SAMPLE_RADIUS);
  return sampleBoard(image, boardSampler, shift.x, shift.y);
}

const difference = frameDifference;

function watch(image) {
  if (mode !== 'watching' || !locked) return;
  const original = image;
  image = prepareMotionFrame(image);
  if (!motionReference) motionReference = createMotionReference(image, locked);
  const shift = estimateCameraShift(image, motionReference);
  if (shift.error > 10) {
    if (!baseline) { motionReference = null; previous = null; stableFrames = 0; status('Az alaphelyzethez lépj ki a képből, és várd meg a nyugodt táblát.'); return; }
    if (++occlusionFrames >= 3) { pauseForRetrieval('Takarás vagy nagy kameraelmozdulás.'); return; }
    smallCandidate = null; previous = null; stableFrames = 0;
    status('A kamera elmozdult vagy a tábla takarásban van. Ha nem áll helyre, koppints a Tábla újrakeresése gombra.');
    return;
  }
  const values = pixels(image, shift); if (!values.length) return;
  const change = baseline ? inspectBoardChange(values, baseline) : null;
  if (change?.obstructed) {
    smallCandidate = null;
    previous = null; stableFrames = 0;
    if (++occlusionFrames >= 3) pauseForRetrieval('Nagy, összefüggő takarás a táblánál.');
    else status('Takarás a táblánál. Nem számolok találatot.', 'warn');
    return;
  }
  occlusionFrames = 0;
  if (!previous || previous.length !== values.length) { previous = values; return; }
  const motion = difference(values, previous); previous = values;
  if (motion.ratio > 0.004 || motion.mean > 2.8) { smallCandidate = null; stableFrames = 0; status('Mozgás a táblánál. Várok a nyugodt képre…'); return; }
  if (++stableFrames < 10) return;
  if (!baseline) {
    if (cv) {
      const visible = detectBullBoard(cv, original);
      if (!visible || !sameBoard(locked, visible.ellipse, .15)) {
        motionReference = null; previous = null; stableFrames = 0;
        status('Az alaphelyzethez látnom kell a bullt és a teljes pontozó gyűrűt. Lépj ki a képből.', 'warn');
        return;
      }
    }
    baseline = emptyBaseline = values; status('Figyelek. Jöhet a dobás!', 'good'); return;
  }
  // The empty board can return without crossing the current hit threshold.
  if (count > 0 && matchesEmptyBoard(values, emptyBaseline)) {
    pauseForRetrieval('Visszatért az üres tábla.');
    return;
  }
  const delta = change, threshold = [0.009, 0.006, 0.0035, 0.002, 0.0012][Number($('sensitivity').value) - 1];
  smallCandidate = confirmSmallHit(smallCandidate, smallHitEvidence(values, baseline, Number($('sensitivity').value)));
  const detected = delta.ratio > threshold || (smallCandidate?.frames ?? 0) >= 3;
  if (count > 0 && detected && looksLikeRemoval(values, baseline, emptyBaseline)) {
    pauseForRetrieval('Nyílkiszedéshez hasonló változás.'); return;
  }
  if (detected && Date.now() - lastEvent > 2200) {
    $('count').textContent = ++count; smallCandidate = null; baseline = values; lastEvent = recentHit = Date.now(); stableFrames = 0;
    status('Nyíl érzékelve · ' + count + '. találat', 'good'); speak('Nyíl érzékelve');
  } else if (Date.now() - recentHit > 2500) status('Figyelek. Jöhet a dobás!', 'good');
}
function tick() {
  if (!stream || video.readyState < 2 || document.hidden) return;
  try {
    const image = capture(); if (!image) return;
    if (mode === 'clearing') { recoverRound(image); return; }
    const now = Date.now();
    if (cv && !locked?.homography && now - lastScan > (mode === 'positioning' ? 550 : 1400)) { lastScan = now; scanBoard(image); }
    if (mode === 'watching' && locked) watch(image);
  } catch (error) { console.error(error); position(); status('A képfeldolgozás megszakadt. Indítsd újra a kamerát.', 'warn'); }
}
function stop() {
  generation++; clearInterval(timer); cancelAnimationFrame(previewRequest);
  const old = stream; stream = null; old?.getTracks().forEach(track => track.stop());
  video.srcObject = null; pc.clearRect(0, 0, preview.width, preview.height); mode = 'off'; boardSampler = null; locked = candidate = previousCandidate = null;
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
    video.srcObject = stream; await video.play(); drawPreview(); $('placeholder').hidden = true; $('live').textContent = '● ÉLŐ KAMERAKÉP';
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
  if (mode !== 'clearing') { pauseForRetrieval('Kézi szünet.'); }
  else { count = 0; $('count').textContent = '0'; mode = 'watching'; lostBoards = 0; lastScan = 0; resetComparison(); status('Lépj ki a képből. Új alaphelyzet rögzítése…'); }
  renderControls();
};
$('zoom').oninput = () => {
  const board = locked || candidate?.ellipse;
  if (board && video.videoWidth && video.videoHeight && frame.width && frame.height) {
    const crop = zoomCrop(video.videoWidth, video.videoHeight, zoom, zoomFocus);
    zoomFocus = { x: (crop.x + board.x / frame.width * crop.width) / video.videoWidth,
      y: (crop.y + board.y / frame.height * crop.height) / video.videoHeight };
  }
  zoom = Math.max(1, Math.min(3, Number($('zoom').value) || 1));
  $('zoom-value').textContent = zoom.toFixed(1) + '×';
  if (stream) {
    position({ preserveCount: true });
    status('Nagyítás módosítva. A teljes tábla külső pereme férjen a képbe; a felismerés után indítsd újra a figyelést.');
  }
};
$('sensitivity').oninput = () => { $('svalue').value = $('sensitivity').value; if (mode === 'watching') { previous = null; stableFrames = 0; status('Érzékenység módosítva. A figyelés folytatódik.'); } };
$('sound').onclick = () => speak('Nyíl érzékelve');
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && stream) { keepAwake(); position(); status('Visszatértél az alkalmazáshoz. Ellenőrizd a körvonalat, majd indítsd újra a figyelést.'); }
});
renderControls(); showQuality(null);
