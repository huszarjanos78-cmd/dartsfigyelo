import { ellipsePoint, placementQuality, spokePattern } from './board-vision.mjs?v=0.11.0';

const isRed = (r, g, b) => r - g > 18 && r > g * 1.25 && r > b * 1.2;
const isGreen = (r, g, b) => g - r > 12 && g > r * 1.15 && g > b * 1.1;
function colourSupport(image, e, radius, colour) {
  let red = 0, green = 0;
  for (let i = 0; i < 120; i++) {
    const p = ellipsePoint(e, radius, i * Math.PI / 60), x = Math.round(p.x), y = Math.round(p.y);
    if (x < 0 || x >= image.width || y < 0 || y >= image.height) continue;
    const j = (y * image.width + x) * 4, d = image.data;
    if (isRed(d[j], d[j + 1], d[j + 2])) red++;
    if (isGreen(d[j], d[j + 1], d[j + 2])) green++;
  }
  return colour === 'green' ? green / 120 : Math.min(red, green) / 60;
}

// A circle's image ellipse has a different centre from the projected physical
// centre. A conic-preserving projective transform anchors the origin at the bull.
export function bullProjection(ellipse, bull) {
  const { a, b, angle, x, y } = ellipse, c = Math.cos(angle), s = Math.sin(angle);
  const dx = bull.x - x, dy = bull.y - y;
  const qx = (dx * c + dy * s) / a, qy = (-dx * s + dy * c) / b;
  const q2 = qx * qx + qy * qy;
  if (q2 > .16) return null;
  const gamma = 1 / Math.sqrt(1 - q2), factor = q2 > 1e-10 ? (gamma - 1) / q2 : 0;
  const n00 = (1 + factor * qx * qx) / gamma, n01 = factor * qx * qy / gamma;
  const n11 = (1 + factor * qy * qy) / gamma;
  const homography = [a * c * n00 - b * s * n01 + x * qx, a * c * n01 - b * s * n11 + x * qy, bull.x,
    a * s * n00 + b * c * n01 + y * qx, a * s * n01 + b * c * n11 + y * qy, bull.y, qx, qy];
  return { ...ellipse, x: bull.x, y: bull.y, homography };
}

function fittedRing(cv, contour, width, height) {
  if (contour.rows < 25 || Math.abs(cv.contourArea(contour)) < width * height * .006) return null;
  const box = cv.fitEllipse(contour);
  let a = box.size.width / 2, b = box.size.height / 2, angle = box.angle * Math.PI / 180;
  if (b > a) { [a, b] = [b, a]; angle += Math.PI / 2; }
  if (b < Math.min(width, height) * .055 || a > Math.max(width, height) * .8 || b / a < .4) return null;
  const e = { x: box.center.x, y: box.center.y, a, b, angle };
  let error = 0; const bins = new Set(), c = Math.cos(angle), s = Math.sin(angle);
  for (let i = 0; i < contour.rows; i++) {
    const dx = contour.data32S[i * 2] - e.x, dy = contour.data32S[i * 2 + 1] - e.y;
    const u = (dx * c + dy * s) / a, v = (-dx * s + dy * c) / b;
    error += Math.abs(Math.hypot(u, v) - 1);
    bins.add(Math.floor((Math.atan2(v, u) + Math.PI) * 24 / (2 * Math.PI)) % 24);
  }
  if (error / contour.rows > .14 || bins.size < 20) return null;
  return e;
}

export function detectBullBoard(cv, image) {
  const { width, height, data } = image;
  const red = new cv.Mat(height, width, cv.CV_8U), coloured = new cv.Mat(height, width, cv.CV_8U);
  const closed = new cv.Mat(), hierarchy = new cv.Mat(), contours = new cv.MatVector();
  const kernel = cv.Mat.ones(3, 3, cv.CV_8U), bulls = [], rings = [];
  const gray = new Uint8Array(width * height);
  try {
    for (let i = 0; i < gray.length; i++) {
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      red.data[i] = isRed(r, g, b) ? 255 : 0;
      coloured.data[i] = red.data[i] || isGreen(r, g, b) ? 255 : 0;
      gray[i] = r * .299 + g * .587 + b * .114;
    }
    cv.findContours(red, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_NONE);
    for (let i = 0; i < Math.min(contours.size(), 600); i++) {
      const contour = contours.get(i);
      try {
        const area = Math.abs(cv.contourArea(contour)), rect = cv.boundingRect(contour);
        if (area < 3 || area > width * height * .002 || area / (rect.width * rect.height) < .35 ||
            Math.min(rect.width, rect.height) / Math.max(rect.width, rect.height) < .35) continue;
        const m = cv.moments(contour);
        if (!m.m00) continue;
        const bull = { x: m.m10 / m.m00, y: m.m01 / m.m00, a: rect.width / 2, b: rect.height / 2, angle: 0 };
        const green = Math.max(...[1.5, 2, 2.5].map(radius => colourSupport(image, bull, radius, 'green')));
        if (green >= .35) bulls.push({ ...bull, green });
      } finally { contour.delete(); }
    }
    if (!bulls.length) return null;
    cv.morphologyEx(coloured, closed, cv.MORPH_CLOSE, kernel);
    cv.findContours(closed, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_NONE);
    for (let i = 0; i < Math.min(contours.size(), 1200); i++) {
      const contour = contours.get(i);
      try { const e = fittedRing(cv, contour, width, height); if (e) rings.push(e); }
      finally { contour.delete(); }
    }
    let best = null, bestScore = 0;
    // Logos and wires can distort a colour contour. Refine each fitted axis
    // against the actual coloured rings instead of trusting its outermost edge.
    const refined = rings.flatMap(e => [.86, .93, 1].flatMap(sa => [.93, 1, 1.07].map(sb => ({ ...e, a: e.a * sa, b: e.b * sb }))));
    for (const ellipse of refined) for (const bull of bulls) {
      // Bull radius must agree with the 12.7 mm bull / 340 mm double-ring ratio.
      const bullRatio = Math.sqrt(bull.a * bull.b / (ellipse.a * ellipse.b));
      if (bullRatio < .018 || bullRatio > .075) continue;
      const projected = bullProjection(ellipse, bull);
      if (!projected) continue;
      const outer = Math.max(...[.95, .98, 1].map(r => colourSupport(image, projected, r)));
      if (outer < .22) continue;
      const inner = Math.max(...[.57, .6, .63, .66, .69].map(r => colourSupport(image, projected, r)));
      if (inner < .22) continue;
      const sectors = spokePattern(gray, width, height, projected);
      if (sectors < .45) continue;
      const score = outer * .35 + inner * .3 + sectors * .25 + bull.green * .1;
      if (score <= bestScore) continue;
      bestScore = score;
      best = { ellipse: projected, bull: { x: bull.x, y: bull.y }, automatic: true,
        quality: placementQuality(gray, width, height, ellipse, .7 + .3 * score), width, height };
    }
    return best;
  } finally { red.delete(); coloured.delete(); closed.delete(); hierarchy.delete(); contours.delete(); kernel.delete(); }
}
