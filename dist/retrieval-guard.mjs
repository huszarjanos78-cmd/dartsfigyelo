import { frameDifference } from './board-vision.mjs?v=0.6';

// Reject broad occlusions, rather than trying to identify a person from one camera.
export function inspectBoardChange(current, baseline) {
  const delta = frameDifference(current, baseline);
  if (delta.ratio > .035) return { ...delta, obstructed: true };
  const positions = current.gridPositions, size = current.gridSize;
  if (delta.ratio < .006 || !positions || !size) return { ...delta, obstructed: false };
  const mask = new Uint8Array(size * size), queue = new Int32Array(mask.length);
  let mean = 0;
  for (let i = 0; i < current.length; i++) mean += current[i] - baseline[i];
  mean /= current.length;
  for (let i = 0; i < current.length; i++) {
    const noise = Math.max(current.edgeNoise?.[i] || 0, baseline.edgeNoise?.[i] || 0);
    if (Math.abs(current[i] - baseline[i] - mean) > 24 + noise) mask[positions[i]] = 1;
  }
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start]) continue;
    let head = 0, tail = 1, minX = size, maxX = 0, minY = size, maxY = 0;
    queue[0] = start; mask[start] = 0;
    while (head < tail) {
      const p = queue[head++], x = p % size, y = Math.floor(p / size);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
        const next = ny * size + nx;
        if (mask[next]) { mask[next] = 0; queue[tail++] = next; }
      }
    }
    const width = maxX - minX + 1, height = maxY - minY + 1;
    if (tail > current.length * .006 && Math.min(width, height) > size * .09 && tail / (width * height) > .3)
      return { ...delta, obstructed: true };
  }
  return { ...delta, obstructed: false };
}

export function looksLikeRemoval(current, baseline, empty) {
  if (!empty) return false;
  const change = frameDifference(current, baseline).ratio;
  const improvement = frameDifference(baseline, empty).ratio - frameDifference(current, empty).ratio;
  return improvement > .001 && improvement > change * .35;
}
