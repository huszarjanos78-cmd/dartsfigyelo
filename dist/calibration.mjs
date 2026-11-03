export const calibrationTargets = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export function projectPoint(h, u, v) {
  const w = h[6] * u + h[7] * v + 1;
  return { x: (h[0] * u + h[1] * v + h[2]) / w, y: (h[3] * u + h[4] * v + h[5]) / w };
}

function leastSquares(rows, values) {
  const n = rows[0].length;
  const a = Array.from({ length: n }, (_, i) => Array.from({ length: n + 1 }, (_, j) =>
    rows.reduce((sum, row, k) => sum + row[i] * (j === n ? values[k] : row[j]), 0)));
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    if (Math.abs(a[pivot][col]) < 1e-10) throw new Error('A pontok túl közel vannak vagy egy vonalba esnek. Jelöld ki újra.');
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const scale = a[col][col];
    for (let j = col; j <= n; j++) a[col][j] /= scale;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = a[row][col];
      for (let j = col; j <= n; j++) a[row][j] -= factor * a[col][j];
    }
  }
  return a.map(row => row[n]);
}

// Fit the four outer-double-ring points while keeping the tapped bull EXACT.
// Normalized camera coordinates keep the least-squares system well conditioned.
export function buildCalibration(points, width, height) {
  if (points.length !== 5 || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.y < 0 || p.x >= width || p.y >= height))
    throw new Error('Öt, a kameraképen belüli pont szükséges.');
  const [bull, ...rim] = points;
  let direction = 0;
  for (let i = 0; i < 4; i++) {
    const p = rim[i], q = rim[(i + 1) % 4], r = rim[(i + 2) % 4];
    const turn = (q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x);
    const inner = (q.x - p.x) * (bull.y - p.y) - (q.y - p.y) * (bull.x - p.x);
    if (Math.abs(turn) < 20 || Math.sign(inner) !== Math.sign(turn) || direction && Math.sign(turn) !== direction)
      throw new Error('A bull legyen a négy perempont belsejében. Sorrend: 20, 6, 3, 11.');
    direction = Math.sign(turn);
  }
  const radii = rim.map(p => Math.hypot(p.x - bull.x, p.y - bull.y));
  if (Math.min(...radii) < 20) throw new Error('A kijelölés túl kicsi. Mutasd közelebbről a táblát.');
  const cx = bull.x / width, cy = bull.y / height, rows = [], values = [];
  for (let i = 0; i < 4; i++) {
    const [u, v] = calibrationTargets[i], x = rim[i].x / width, y = rim[i].y / height;
    rows.push([u, v, 0, 0, -x * u, -x * v], [0, 0, u, v, -y * u, -y * v]);
    values.push(x - cx, y - cy);
  }
  const [a, b, d, e, g, h] = leastSquares(rows, values);
  if (Math.hypot(g, h) >= .85) throw new Error('Túl bizonytalan a vetület. Ellenőrizd a bullt és a négy perempontot.');
  const homography = [a * width, b * width, bull.x, d * height, e * height, bull.y, g, h];
  const meanRadius = radii.reduce((sum, r) => sum + r, 0) / 4;
  for (let i = 0; i < 4; i++) {
    const p = projectPoint(homography, ...calibrationTargets[i]);
    if (Math.hypot(p.x - rim[i].x, p.y - rim[i].y) > meanRadius * .08 + 2)
      throw new Error('A pontok nem illeszkednek. A dupla gyűrű külső szélén, a számozott mezők közepén jelölj.');
  }
  for (let i = 0; i < 120; i++) {
    const t = i * Math.PI / 60, p = projectPoint(homography, Math.cos(t), Math.sin(t));
    if (p.x < 0 || p.x >= width || p.y < 0 || p.y >= height) throw new Error('A teljes pontozó gyűrű férjen a kameraképbe.');
  }
  return { x: bull.x, y: bull.y, a: Math.max(...radii), b: Math.min(...radii), angle: 0, homography };
}
