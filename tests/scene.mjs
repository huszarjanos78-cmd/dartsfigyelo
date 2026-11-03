export function scene({ x = 240, y = 180, a = 145, b = 145, angle = 0, plain = false, empty = false, brightness = 1, surround = 1, surroundShade = 65, dart = false, stripedSurround = false } = {}) {
  const width = 480, height = 360, data = new Uint8ClampedArray(width * height * 4);
  for (let py = 0; py < height; py++) for (let px = 0; px < width; px++) {
    const dx = px - x, dy = py - y, c = Math.cos(angle), s = Math.sin(angle);
    const u = (dx * c + dy * s) / a, v = (-dx * s + dy * c) / b;
    const r = Math.hypot(u, v), theta = (Math.atan2(v, u) + Math.PI * 2) % (Math.PI * 2);
    const sector = Math.floor(theta * 20 / (2 * Math.PI)), even = sector % 2 === 0;
    let rgb = [150, 158, 163];
    if (!empty && r < surround) rgb = [surroundShade, surroundShade + 1, surroundShade + 3];
    if (!empty && stripedSurround && r >= 1 && r < surround) rgb = even ? [180, 180, 180] : [30, 30, 30];
    if (!empty && r < 1) {
      rgb = [24, 25, 24];
      if (!plain && r < 0.79) {
        rgb = even ? [223, 211, 177] : [25, 27, 23];
        if (r > 0.74 || r > 0.46 && r < 0.5 || r < 0.08) rgb = even ? [174, 32, 28] : [28, 119, 58];
        if (r < 0.08) rgb = [28, 119, 58];
        if (r < 0.035) rgb = [185, 35, 27];
        if (Math.min(...[0.035, 0.08, 0.46, 0.5, 0.74, 0.79].map(edge => Math.abs(r - edge))) < 0.004) rgb = [170, 170, 160];
      }
    }
    if (dart && u > 0.1 && u < 0.5 && v > 0.1 && v < 0.18) rgb = [8, 8, 8];
    const i = (py * width + px) * 4;
    for (let k = 0; k < 3; k++) data[i + k] = rgb[k] * brightness;
    data[i + 3] = 255;
  }
  return { width, height, data };
}
