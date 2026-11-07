// Principal-axis spans do not grow just because a narrow object is diagonal.
export function principalSpans(count, sx, sy, sxx, syy, sxy) {
  const vx = Math.max(0, sxx / count - (sx / count) ** 2);
  const vy = Math.max(0, syy / count - (sy / count) ** 2);
  const covariance = sxy / count - sx * sy / (count * count);
  const spread = Math.hypot(vx - vy, 2 * covariance);
  return { minor: Math.sqrt(12 * Math.max(0, (vx + vy - spread) / 2)),
    major: Math.sqrt(12 * Math.max(0, (vx + vy + spread) / 2)) };
}
