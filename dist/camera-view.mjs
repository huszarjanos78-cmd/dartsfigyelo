export function zoomCrop(width, height, zoom, focus = { x: .5, y: .5 }) {
  const factor = Math.max(1, Math.min(3, Number(zoom) || 1));
  const sw = width / factor, sh = height / factor;
  return { x: Math.max(0, Math.min(width - sw, width * focus.x - sw / 2)),
    y: Math.max(0, Math.min(height - sh, height * focus.y - sh / 2)), width: sw, height: sh };
}

// OCR uses a separate, sharper crop. Scale the projection along with the image;
// independently scaling ellipse axes would be wrong for a rotated ellipse.
export function rescaleBoard(board, sx, sy) {
  const c = Math.cos(board.angle || 0), s = Math.sin(board.angle || 0);
  const h = board.homography || [board.a*c,-board.b*s,board.x,board.a*s,board.b*c,board.y,0,0];
  return { ...board, x:board.x*sx, y:board.y*sy,
    homography:[h[0]*sx,h[1]*sx,h[2]*sx,h[3]*sy,h[4]*sy,h[5]*sy,h[6],h[7]] };
}
