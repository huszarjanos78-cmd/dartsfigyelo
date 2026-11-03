// Keep the coarse, smoothed motion guard. Use a second, unblurred colour signal
// only for small, localized changes that persist in the same place over time.
export function smallHitEvidence(current, baseline, sensitivity = 3) {
  if (!current.fine || !baseline.fine || !current.gridPositions) return null;
  const count = current.length, size = current.gridSize, means = [0, 0, 0];
  for (let i = 0; i < count; i++) for (let c = 0; c < 3; c++) means[c] += current.fine[i * 3 + c] - baseline.fine[i * 3 + c];
  for (let c = 0; c < 3; c++) means[c] /= count;
  const mask = new Uint8Array(size * size), queue = new Int32Array(mask.length);
  let changed = 0;
  for (let i = 0; i < count; i++) {
    let delta = 0;
    for (let c = 0; c < 3; c++) delta = Math.max(delta, Math.abs(current.fine[i * 3 + c] - baseline.fine[i * 3 + c] - means[c]));
    if (delta > 18 + (baseline.fineNoise?.[i] || 0) * .8) { mask[current.gridPositions[i]] = 1; changed++; }
  }
  if (changed / count > .025) return null;
  const minimum = Math.max(10, Math.ceil(count * [.0012, .0009, .0006, .0004, .00025][Math.max(0, Math.min(4, sensitivity - 1))]));
  let best = null;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start]) continue;
    let head = 0, tail = 1, sx = 0, sy = 0, minX = size, maxX = 0, minY = size, maxY = 0;
    queue[0] = start; mask[start] = 0;
    while (head < tail) {
      const p = queue[head++], x = p % size, y = Math.floor(p / size);
      sx += x; sy += y; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
        const next = ny * size + nx;
        if (mask[next]) { mask[next] = 0; queue[tail++] = next; }
      }
    }
    const width = maxX - minX + 1, height = maxY - minY + 1;
    if (tail < minimum || Math.max(width, height) < 7 || Math.min(width, height) > size * .09) continue;
    if (!best || tail > best.area) best = { x: sx / tail, y: sy / tail, area: tail };
  }
  return best;
}

export function confirmSmallHit(previous, evidence) {
  if (!evidence) return null;
  const matches = previous && Math.hypot(previous.x - evidence.x, previous.y - evidence.y) <= 5 &&
    evidence.area / previous.area > .5 && evidence.area / previous.area < 2;
  return { ...evidence, frames: matches ? previous.frames + 1 : 1 };
}

export function fineChangeRatio(current, baseline) {
  if (!current.fine || !baseline.fine) return 0;
  const means = [0, 0, 0];
  for (let i = 0; i < current.length; i++) for (let c = 0; c < 3; c++) means[c] += current.fine[i * 3 + c] - baseline.fine[i * 3 + c];
  for (let c = 0; c < 3; c++) means[c] /= current.length;
  let changed = 0;
  for (let i = 0; i < current.length; i++) {
    let delta = 0;
    for (let c = 0; c < 3; c++) delta = Math.max(delta, Math.abs(current.fine[i * 3 + c] - baseline.fine[i * 3 + c] - means[c]));
    if (delta > 18 + (baseline.fineNoise?.[i] || 0) * .8) changed++;
  }
  return changed / current.length;
}
