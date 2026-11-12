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
// The visible change is often shaft/flight, not the tip: always editable.
// Use the largest connected component and its innermost point as a rough tip.
export function estimateHit(current, baseline, rotation = 0) {
  if (!current.gridPositions || !current.gridSize || current.length !== baseline.length) return null;
  const size = current.gridSize, radius = current.gridRadius || 1;
  const mask = new Set(); let mean = 0;
  for(let i=0;i<current.length;i++) mean += current[i]-baseline[i];
  mean /= current.length;
  const means = [0,0,0];
  if(current.fine && baseline.fine) {
    for(let i=0;i<current.length;i++) for(let c=0;c<3;c++) means[c] += current.fine[i*3+c]-baseline.fine[i*3+c];
    for(let c=0;c<3;c++) means[c] /= current.length;
  }
  for(let i=0;i<current.length;i++) {
    let changed = Math.abs(current[i]-baseline[i]-mean) > 24 + Math.max(current.edgeNoise?.[i]||0,baseline.edgeNoise?.[i]||0);
    if(current.fine && baseline.fine) for(let c=0;c<3;c++) changed ||= Math.abs(current.fine[i*3+c]-baseline.fine[i*3+c]-means[c]) > 18+(baseline.fineNoise?.[i]||0)*.8;
    if(changed) mask.add(current.gridPositions[i]);
  }
  let best = [];
  while(mask.size) {
    const queue = [mask.values().next().value]; mask.delete(queue[0]);
    for(let i=0;i<queue.length;i++) {
      const p=queue[i], x=p%size,y=Math.floor(p/size);
      for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) {
        const nx=x+dx,ny=y+dy,n=ny*size+nx;
        if(nx>=0 && nx<size && ny>=0 && ny<size && mask.delete(n)) queue.push(n);
      }
    }
    if(queue.length>best.length) best=queue;
  }
  if(best.length<3) return null;
  const points=best.map(p=>({x:(2*(p%size+.5)/size-1)*radius,y:(2*(Math.floor(p/size)+.5)/size-1)*radius}));
  points.sort((a,b)=>Math.hypot(a.x,a.y)-Math.hypot(b.x,b.y));
  return scoreAt(points[0].x,points[0].y,rotation);
}

export function boardCoordinates(e,x,y) {
  if(!e.homography) { const dx=x-e.x,dy=y-e.y,c=Math.cos(e.angle),s=Math.sin(e.angle); return {x:(dx*c+dy*s)/e.a,y:(-dx*s+dy*c)/e.b}; }
  const h=e.homography, a=h[0]-x*h[6], b=h[1]-x*h[7], c=h[3]-y*h[6], d=h[4]-y*h[7], det=a*d-b*c;
  if(Math.abs(det)<1e-10) return null;
  return {x:((x-h[2])*d-b*(y-h[5]))/det,y:(a*(y-h[5])-(x-h[2])*c)/det};
}
