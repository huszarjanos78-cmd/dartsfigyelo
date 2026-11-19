// Coordinates use the outer double radius, with 20 at the top.
const sectors = [20,1,18,4,13,6,10,15,2,17,3,19,7,16,8,11,14,9,12,5];
export function scoreAt(x, y, rotation = 0) {
  if (![x,y,rotation].every(Number.isFinite)) return null;
  const r = Math.hypot(x,y);
  if (r > 1) return { score: 0, sector: 0, multiplier: 0 };
  if (r <= 6.35/170) return { score: 50, sector: 25, multiplier: 2 };
  if (r <= 15.9/170) return { score: 25, sector: 25, multiplier: 1 };
  const angle = ((Math.atan2(x,-y) - rotation) % (2*Math.PI) + 2*Math.PI) % (2*Math.PI);
  const sector = sectors[Math.floor((angle + Math.PI/20) / (Math.PI/10)) % 20];
  const multiplier = r >= 162/170 ? 2 : r >= 99/170 && r <= 107/170 ? 3 : 1;
  return { score: sector*multiplier, sector, multiplier };
}
export function boardCoordinates(e,x,y) {
  if(!e.homography) { const dx=x-e.x,dy=y-e.y,c=Math.cos(e.angle),s=Math.sin(e.angle); return {x:(dx*c+dy*s)/e.a,y:(-dx*s+dy*c)/e.b}; }
  const h=e.homography, a=h[0]-x*h[6], b=h[1]-x*h[7], c=h[3]-y*h[6], d=h[4]-y*h[7], det=a*d-b*c;
  if(Math.abs(det)<1e-10) return null;
  return {x:((x-h[2])*d-b*(y-h[5]))/det,y:(a*(y-h[5])-(x-h[2])*c)/det};
}


// The user keeps 20 directly above the bull in the camera image. The sampler's
// axes can still be rotated by ellipse fitting, so convert screen-up into the
// board plane instead of assuming that the sampler's rotation is zero.
export function uprightScoreRotation(board) {
  const x = board.homography ? board.homography[2] : board.x;
  const y = board.homography ? board.homography[5] : board.y;
  const point = boardCoordinates(board,x,y-1);
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || Math.hypot(point.x,point.y)<1e-12) return null;
  return Math.atan2(point.x,-point.y);
}
