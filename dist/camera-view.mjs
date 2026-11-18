export function zoomCrop(width, height, zoom, focus = { x: .5, y: .5 }) {
  const factor = Math.max(1, Math.min(3, Number(zoom) || 1));
  const sw = width / factor, sh = height / factor;
  return { x: Math.max(0, Math.min(width - sw, width * focus.x - sw / 2)),
    y: Math.max(0, Math.min(height - sh, height * focus.y - sh / 2)), width: sw, height: sh };
}
