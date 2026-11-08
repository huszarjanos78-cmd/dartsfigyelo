// Scores describe image geometry and quality; they are not recognition probabilities.
import { projectPoint } from './calibration.mjs?v=0.9.1';
export { buildCalibration } from './calibration.mjs?v=0.9.1';
export const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
// Standard 450 mm physical board vs 340 mm outer double-ring diameter.
export const BOARD_OUTER_RADIUS = 225 / 170;
export const BOARD_SAMPLE_RADIUS = 1.34;
export const BOARD_SAMPLE_SIZE = 256;
export function ellipsePoint(e, r, t) {
  if (e.homography) return projectPoint(e.homography, r * Math.cos(t), r * Math.sin(t));
  const u = e.a * r * Math.cos(t), v = e.b * r * Math.sin(t), c = Math.cos(e.angle), s = Math.sin(e.angle);
  return { x: e.x + u * c - v * s, y: e.y + u * s + v * c };
}
export function insideEllipse(e, x, y, scale = 1) {
  const dx = x - e.x, dy = y - e.y, c = Math.cos(e.angle), s = Math.sin(e.angle);
  return ((dx * c + dy * s) / (e.a * scale)) ** 2 + ((-dx * s + dy * c) / (e.b * scale)) ** 2 <= 1;
}
export function sameBoard(a, b, tolerance = 0.08) {
  return !!a && !!b && Math.hypot(a.x - b.x, a.y - b.y) < a.a * tolerance &&
    Math.abs(a.a - b.a) / a.a < tolerance && Math.abs(a.b - b.b) / a.b < tolerance &&
    (a.b / a.a > 0.92 && b.b / b.a > 0.92 || Math.abs(Math.sin(a.angle - b.angle)) < tolerance * 2);
}

// Cache an affine or bull-anchored projective sampling grid until repositioning.
// A radius above one includes the narrow board margin outside the double ring.
// Bilinear sampling avoids nearest-pixel jumps; off-screen padded points are omitted.
export function createBoardSampler(width, height, e, size = 192, radius = .98) {
  const indices = [], weights = [], gridPositions = [], c = Math.cos(e.angle), s = Math.sin(e.angle);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (2 * (x + 0.5) / size - 1) * radius;
    const v = (2 * (y + 0.5) / size - 1) * radius;
    if (u * u + v * v > radius ** 2) continue;
    const projected = e.homography ? projectPoint(e.homography, u, v) : { x: e.x + e.a * u * c - e.b * v * s, y: e.y + e.a * u * s + e.b * v * c };
    if (radius > 1 && (projected.x < 0 || projected.y < 0 || projected.x >= width - 1 || projected.y >= height - 1)) continue;
    const px = clamp(projected.x, 0, width - 1);
    const py = clamp(projected.y, 0, height - 1);
    const ix = Math.min(Math.floor(px), width - 2), iy = Math.min(Math.floor(py), height - 2);
    indices.push((iy * width + ix) * 4);
    gridPositions.push(y * size + x);
    weights.push(px - ix, py - iy);
  }
  return { width, height, size, radius, gridPositions: new Int32Array(gridPositions), indices: new Int32Array(indices), weights: new Float32Array(weights) };
}
export function sampleBoard(image, map, dx = 0, dy = 0) {
  if (image.width !== map.width || image.height !== map.height) throw new Error('Camera dimensions changed');
  image = prepareMotionFrame(image);
  const values = new Float32Array(map.indices.length), stride = image.width * 4;
  values.edgeNoise = new Float32Array(values.length);
  values.gridPositions = map.gridPositions;
  values.gridSize = map.size;
  values.gridRadius = map.radius;
  if (image.rgba) {
    values.fine = new Float32Array(values.length * 3);
    values.fineNoise = new Float32Array(values.length);
  }
  const gray = i => image.gray[i / 4];
  for (let n = 0; n < values.length; n++) {
    let i = map.indices[n], fx = map.weights[n * 2], fy = map.weights[n * 2 + 1];
    if (dx || dy) {
      const x = clamp((i % stride) / 4 + fx + dx, 0, image.width - 1);
      const y = clamp(Math.floor(i / stride) + fy + dy, 0, image.height - 1);
      const ix = Math.min(Math.floor(x), image.width - 2), iy = Math.min(Math.floor(y), image.height - 2);
      i = (iy * image.width + ix) * 4; fx = x - ix; fy = y - iy;
    }
    values[n] = (gray(i) * (1 - fx) + gray(i + 4) * fx) * (1 - fy) +
      (gray(i + stride) * (1 - fx) + gray(i + stride + 4) * fx) * fy;
    values.edgeNoise[n] = .6 * (Math.abs(gray(i + 4) - gray(i)) + Math.abs(gray(i + stride) - gray(i)));
    if (image.rgba) {
      const d = image.rgba, left = i % stride >= 4 ? i - 4 : i, up = i >= stride ? i - stride : i;
      for (let channel = 0; channel < 3; channel++) {
        values.fine[n * 3 + channel] = (d[i + channel] * (1 - fx) + d[i + 4 + channel] * fx) * (1 - fy) +
          (d[i + stride + channel] * (1 - fx) + d[i + stride + 4 + channel] * fx) * fy;
        values.fineNoise[n] = Math.max(values.fineNoise[n], Math.abs(d[i + channel] - d[left + channel]),
          Math.abs(d[i + channel] - d[up + channel]), Math.abs(d[i + channel] - d[i + 4 + channel]),
          Math.abs(d[i + channel] - d[i + stride + channel]));
      }
    }
  }
  return values;
}

export function frameDifference(a, b) {
  let mean = 0;
  for (let i = 0; i < a.length; i++) mean += a[i] - b[i];
  mean /= a.length;
  let changed = 0, total = 0;
  for (let i = 0; i < a.length; i++) {
    const delta = Math.abs(a[i] - b[i] - mean);
    const uncertainty = Math.max(a.edgeNoise?.[i] || 0, b.edgeNoise?.[i] || 0);
    total += Math.max(0, delta - uncertainty);
    if (delta > 24 + uncertainty) changed++;
  }
  return { ratio: changed / a.length, mean: total / a.length };
}

export function prepareMotionFrame(image) {
  if (image.gray) return image;
  const { width, height, data } = image, gray = new Float32Array(width * height);
  const horizontal = new Float32Array(gray.length), smooth = new Float32Array(gray.length);
  for (let i = 0; i < gray.length; i++) gray[i] = data[i * 4] * .299 + data[i * 4 + 1] * .587 + data[i * 4 + 2] * .114;
  // A small separable Gaussian reduces sensor noise and subpixel edge flicker.
  const weights = [1, 4, 6, 4, 1];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let k = -2; k <= 2; k++) sum += gray[y * width + clamp(x + k, 0, width - 1)] * weights[k + 2];
    horizontal[y * width + x] = sum / 16;
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let k = -2; k <= 2; k++) sum += horizontal[clamp(y + k, 0, height - 1) * width + x] * weights[k + 2];
    smooth[y * width + x] = sum / 16;
  }
  return { width, height, gray: smooth, rgba: data };
}

function grayAt(image, x, y) {
  x = clamp(x, 0, image.width - 1); y = clamp(y, 0, image.height - 1);
  const ix = Math.min(Math.floor(x), image.width - 2), iy = Math.min(Math.floor(y), image.height - 2);
  const fx = x - ix, fy = y - iy, i = (iy * image.width + ix) * 4, row = image.width * 4;
  const g = index => image.gray[index / 4];
  return (g(i) * (1 - fx) + g(i + 4) * fx) * (1 - fy) + (g(i + row) * (1 - fx) + g(i + row + 4) * fx) * fy;
}
export function createMotionReference(image, ellipse) {
  image = prepareMotionFrame(image);
  const points = [], values = [];
  // Spread samples over the whole board, so a local dart or a hand does not
  // become the camera-motion estimate. Keep this reference fixed for the round.
  for (let y = -8; y <= 8; y++) for (let x = -8; x <= 8; x++) {
    if (x * x + y * y > 64) continue;
    const p = ellipsePoint(ellipse, Math.hypot(x, y) / 9, Math.atan2(y, x));
    points.push(p.x, p.y); values.push(grayAt(image, p.x, p.y));
  }
  return { width: image.width, height: image.height, points, values };
}
export function estimateCameraShift(image, reference, limit = 4) {
  image = prepareMotionFrame(image);
  if (image.width !== reference.width || image.height !== reference.height) throw new Error('Camera dimensions changed');
  const diffs = new Float32Array(reference.values.length);
  function error(dx, dy) {
    let mean = 0;
    for (let i = 0; i < diffs.length; i++) {
      diffs[i] = grayAt(image, reference.points[i * 2] + dx, reference.points[i * 2 + 1] + dy) - reference.values[i];
      mean += diffs[i];
    }
    mean /= diffs.length;
    let total = 0;
    // Limit the influence of local changes, while retaining global movement.
    for (const d of diffs) total += Math.min(30, Math.abs(d - mean));
    return total / diffs.length;
  }
  const zero = error(0, 0);
  let best = { x: 0, y: 0, error: zero };
  for (let y = -limit; y <= limit; y++) for (let x = -limit; x <= limit; x++) {
    const score = error(x, y);
    if (score < best.error) best = { x, y, error: score };
  }
  for (const step of [0.5, 0.25]) {
    const center = best;
    for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
      const dx = center.x + x * step, dy = center.y + y * step;
      if (Math.abs(dx) > limit || Math.abs(dy) > limit) continue;
      const score = error(dx, dy);
      if (score < best.error) best = { x: dx, y: dy, error: score };
    }
  }
  return zero - best.error < 0.25 ? { x: 0, y: 0, error: zero } : best;
}
function sample(gray, w, h, x, y) { return gray[clamp(Math.round(y), 0, h - 1) * w + clamp(Math.round(x), 0, w - 1)]; }
export function spokePattern(gray, w, h, e) {
  const scores = [], outerScores = [];
  for (const r of [0.38, 0.5, 0.62, 0.65, 0.7, 0.86]) {
    const values = [];
    for (let i = 0; i < 180; i++) {
      const p = ellipsePoint(e, r, i * Math.PI / 90); values.push(sample(gray, w, h, p.x, p.y));
    }
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
    let first = 0, last = 0, transitions = 0;
    for (let i = 0; i < values.length; i++) {
      const v = (values[(i + 179) % 180] + values[i] + values[(i + 1) % 180]) / 3;
      const threshold = Math.max(9, sd * 0.22), sign = v > mean + threshold ? 1 : v < mean - threshold ? -1 : 0;
      if (sign) { if (!first) first = sign; if (last && last !== sign) transitions++; last = sign; }
    }
    if (first && last && first !== last) transitions++;
    const score = clamp(1 - Math.abs(transitions - 20) / 12) * clamp((sd - 12) / 28);
    scores.push(score);
    if (r === 0.65 || r === 0.7) outerScores.push(score);
  }
  // A standard board's scoring area reaches roughly 75% of its physical radius.
  // Sampling only the strongest inner rings also accepts a larger foam surround
  // containing a real board. Require sector evidence near the expected outer
  // scoring area before allowing that contour to participate in ranking.
  if (Math.min(...outerScores) < 0.5) return 0;
  scores.sort((a, b) => b - a);
  return scores[0] * 0.65 + scores[1] * 0.35;
}
function contourEllipse(cv, contour, w, h) {
  if (contour.rows < 20 || Math.abs(cv.contourArea(contour)) < w * h * 0.008) return null;
  const box = cv.fitEllipse(contour);
  let a = box.size.width / 2, b = box.size.height / 2, angle = box.angle * Math.PI / 180;
  if (a < b) { [a, b] = [b, a]; angle += Math.PI / 2; }
  const e = { x: box.center.x, y: box.center.y, a, b, angle };
  if (![e.x, e.y, a, b, angle].every(Number.isFinite) || b < Math.min(w, h) * 0.1 || a > Math.max(w, h) * 0.75 ||
      b / a < 0.38 || e.x < 0 || e.y < 0 || e.x > w || e.y > h) return null;
  let error = 0;
  const bins = new Set(), c = Math.cos(angle), s = Math.sin(angle);
  for (let i = 0; i < contour.rows; i++) {
    const dx = contour.data32S[i * 2] - e.x, dy = contour.data32S[i * 2 + 1] - e.y;
    const u = (dx * c + dy * s) / a, v = (-dx * s + dy * c) / b;
    error += Math.abs(Math.hypot(u, v) - 1);
    bins.add(Math.floor((Math.atan2(v, u) + Math.PI) * 24 / (2 * Math.PI)) % 24);
  }
  error /= contour.rows;
  if (error > 0.13 || bins.size < 17) return null;
  e.fit = clamp(1 - error / 0.16) * bins.size / 24; return e;
}

// A surround can contain the sector pattern, but its edge does not have the
// double/triple rings at the correct radii. Require both colours around both rings.
export function scoringRingEvidence(image, e) {
  const bands = [];
  for (let r = .4; r <= 1.04; r += .02) {
    let red = 0, green = 0;
    for (let i = 0; i < 120; i++) {
      let hasRed = false, hasGreen = false;
      for (const offset of [-.025, 0, .025]) {
        const p = ellipsePoint(e, r + offset, i * Math.PI / 60);
        const x = Math.round(p.x), y = Math.round(p.y);
        if (x < 0 || x >= image.width || y < 0 || y >= image.height) continue;
        const j = (y * image.width + x) * 4;
        const a = image.data[j], b = image.data[j + 1], c = image.data[j + 2];
        if (a > b * 1.25 && a > c * 1.2 && a - b > 18) hasRed = true;
        if (b > a * 1.15 && b > c * 1.1 && b - a > 12) hasGreen = true;
      }
      if (hasRed) red++;
      if (hasGreen) green++;
    }
    bands.push({ r, support: Math.min(red, green) / 60 });
  }
  let best = 0;
  for (const outer of bands) {
    if (outer.r < .74 || outer.support < .22) continue;
    for (const inner of bands) {
      const ratio = inner.r / outer.r;
      if (ratio < .55 || ratio > .69) continue;
      best = Math.max(best, Math.min(outer.support, inner.support));
    }
  }
  return best;
}
export function placementQuality(gray, w, h, e, confidence = 1) {
  const ex = Math.hypot(e.a * Math.cos(e.angle), e.b * Math.sin(e.angle));
  const ey = Math.hypot(e.a * Math.sin(e.angle), e.b * Math.cos(e.angle));
  const margin = Math.min(e.x - ex, w - e.x - ex, e.y - ey, h - e.y - ey);
  const sizeRatio = 2 * e.b / Math.min(w, h), size = clamp((sizeRatio - 0.2) / 0.46);
  // A 45-degree side view has an axis ratio of about cos(45°) = 0.71.
  // It is a supported position; continue requiring enough pixels on the short axis.
  const angle = clamp((e.b / e.a - 0.45) / 0.25);
  let visible = 0;
  for (let i = 0; i < 120; i++) {
    const p = ellipsePoint(e, 1, i * Math.PI / 60);
    if (p.x >= 2 && p.x < w - 2 && p.y >= 2 && p.y < h - 2) visible++;
  }
  const framing = visible / 120 * (0.7 + 0.3 * clamp(margin / (Math.min(w, h) * 0.05)));
  let sum = 0, squared = 0, lap = 0, n = 0;
  for (let y = Math.max(1, Math.floor(e.y - ey)); y < Math.min(h - 1, e.y + ey); y += 2)
    for (let x = Math.max(1, Math.floor(e.x - ex)); x < Math.min(w - 1, e.x + ex); x += 2) {
      if (!insideEllipse(e, x, y, 0.92)) continue;
      const i = y * w + x, v = gray[i]; sum += v; squared += v * v;
      lap += (4 * v - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w]) ** 2; n++;
    }
  const mean = sum / Math.max(1, n), variance = squared / Math.max(1, n) - mean ** 2;
  const sharpness = clamp((lap / Math.max(1, n) - 12) / 240);
  const lighting = clamp((mean - 22) / 48) * clamp((240 - mean) / 55) * clamp(Math.sqrt(Math.max(0, variance)) / 35);
  const details = { size, angle, sharpness, lighting, framing };
  let score = Math.round((size * 0.27 + angle * 0.25 + sharpness * 0.22 + lighting * 0.12 + framing * 0.14) * 100);
  if (visible < 116 || margin < 0 || sizeRatio < 0.32 || e.b / e.a < 0.52) score = Math.min(score, 44);
  if (sizeRatio < 0.46 || e.b / e.a < 0.6) score = Math.min(score, 54);
  else if (sizeRatio < 0.55 || e.b / e.a < 0.65) score = Math.min(score, 74);
  if (confidence < 0.6) score = Math.min(score, 49);
  const tips = [];
  if (framing < 0.85) tips.push('Lépj hátrébb vagy igazítsd középre: a teljes tábla férjen a képbe.');
  if (angle < 0.7) tips.push('Túl lapos a rálátás. Közelíts a kb. 45 fokos oldalnézethez; a teljes tábla maradjon látható.');
  if (size < 0.65) tips.push('Menj közelebb: a tábla nagyobb részt töltsön ki a képből.');
  if (sharpness < 0.55) tips.push('Rögzítsd a telefont, és várd meg, amíg a kép éles lesz.');
  if (lighting < 0.7) tips.push('Világítsd meg egyenletesebben a táblát, csillogás nélkül.');
  if (!tips.length) tips.push(score >= 75 ? 'Jó beállítás. Rögzítsd a telefont, és indítsd a figyelést.' : 'Még finomíts a kamera helyzetén, majd rögzítsd a telefont.');
  return { score, details, tips, sizeRatio, axisRatio: e.b / e.a };
}
export function detectBoard(cv, image) {
  const { width: w, height: h } = image;
  const src = cv.matFromImageData(image), gray = new cv.Mat(), blur = new cv.Mat(), binary = new cv.Mat();
  const edges = new cv.Mat(), hierarchy = new cv.Mat(), contours = new cv.MatVector();
  const kernel = cv.Mat.ones(3, 3, cv.CV_8U), candidates = [];
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY); cv.GaussianBlur(gray, blur, new cv.Size(3, 3), 0);
    for (let pass = 0; pass < 2; pass++) {
      if (!pass) { cv.Canny(blur, edges, 35, 100); cv.morphologyEx(edges, binary, cv.MORPH_CLOSE, kernel); }
      else cv.threshold(blur, binary, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
      cv.findContours(binary, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_NONE);
      for (let i = 0; i < Math.min(contours.size(), 1500); i++) {
        const contour = contours.get(i);
        try { const e = contourEllipse(cv, contour, w, h); if (e && !candidates.some(old => sameBoard(old, e, 0.025))) candidates.push(e); }
        finally { contour.delete(); }
      }
    }
    if (candidates.length < 2) {
      const circles = new cv.Mat();
      try {
        cv.HoughCircles(blur, circles, cv.HOUGH_GRADIENT, 1.5, Math.min(w, h) * 0.3, 110, 55, Math.round(Math.min(w, h) * 0.18), Math.round(Math.min(w, h) * 0.49));
        for (let i = 0; i < Math.min(circles.data32F.length, 18); i += 3) {
          const [x, y, r] = circles.data32F.slice(i, i + 3); candidates.push({ x, y, a: r, b: r, angle: 0, fit: 0.65 });
        }
      } finally { circles.delete(); }
    }
    const ranked = [];
    for (const e of candidates) {
      const spokes = spokePattern(gray.data, w, h, e);
      if (spokes < .5 || scoringRingEvidence(image, e) < .22) continue;
      const rings = candidates.filter(other => other !== e && Math.hypot(other.x - e.x, other.y - e.y) < e.a * 0.09 &&
        other.a / e.a > 0.22 && other.a / e.a < 0.92 && Math.abs(other.a / e.a - other.b / e.b) < 0.14).length;
      const confidence = 0.55 * spokes + 0.25 * e.fit + 0.2 * Math.min(1, rings / 2);
      if (spokes >= 0.5 && confidence >= 0.62 && (rings > 0 || spokes >= 0.86)) ranked.push({ ...e, confidence });
    }
    if (!ranked.length) return null;
    ranked.sort((a, b) => b.confidence - a.confidence);
    const best = ranked.filter(e => e.confidence >= ranked[0].confidence - 0.13).sort((a, b) => b.a * b.b - a.a * a.b)[0];
    return { ellipse: best, quality: placementQuality(gray.data, w, h, best, best.confidence), width: w, height: h };
  } finally { for (const mat of [src, gray, blur, binary, edges, hierarchy, contours, kernel]) mat.delete(); }
}
