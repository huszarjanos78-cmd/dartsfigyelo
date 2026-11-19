// Pure preprocessing/postprocessing for the pinned seven-class YOLOv8n model.
export const TIP_INPUT_SIZE = 800;
export function letterboxGeometry(image, crop = {x:0,y:0,width:image.width,height:image.height}) {
  const scale=Math.min(TIP_INPUT_SIZE/crop.width,TIP_INPUT_SIZE/crop.height);
  const width=Math.round(crop.width*scale),height=Math.round(crop.height*scale);
  return {...crop,sourceWidth:crop.width,sourceHeight:crop.height,scale,width,height,left:Math.floor((TIP_INPUT_SIZE-width)/2),top:Math.floor((TIP_INPUT_SIZE-height)/2)};
}
export function prepareTipInput(image,crop) {
  const geometry=letterboxGeometry(image,crop), size=TIP_INPUT_SIZE, plane=size*size;
  const tensor=new Float32Array(3*plane).fill(114/255),data=image.data;
  for(let y=0;y<geometry.height;y++)for(let x=0;x<geometry.width;x++) {
    const px=Math.max(0,Math.min(image.width-1,geometry.x+(x+.5)/geometry.scale-.5));
    const py=Math.max(0,Math.min(image.height-1,geometry.y+(y+.5)/geometry.scale-.5));
    const ix=Math.floor(px),iy=Math.floor(py),jx=Math.min(ix+1,image.width-1),jy=Math.min(iy+1,image.height-1),fx=px-ix,fy=py-iy;
    const out=(y+geometry.top)*size+x+geometry.left;
    for(let c=0;c<3;c++) tensor[out+c*plane]=(
      (data[(iy*image.width+ix)*4+c]*(1-fx)+data[(iy*image.width+jx)*4+c]*fx)*(1-fy)+
      (data[(jy*image.width+ix)*4+c]*(1-fx)+data[(jy*image.width+jx)*4+c]*fx)*fy)/255;
  }
  return {tensor,geometry};
}
function overlap(a,b) {
  const w=Math.max(0,Math.min(a.x+a.w/2,b.x+b.w/2)-Math.max(a.x-a.w/2,b.x-b.w/2));
  const h=Math.max(0,Math.min(a.y+a.h/2,b.y+b.h/2)-Math.max(a.y-a.h/2,b.y-b.h/2));
  return w*h/(a.w*a.h+b.w*b.h-w*h || 1);
}
export function decodeTips(data,dims,geometry,confidence=.5) {
  if(dims.length!==3 || dims[0]!==1 || dims[1]!==11 || data.length!==dims[1]*dims[2]) throw new Error('Unexpected dart model output');
  const n=dims[2],candidates=[];
  for(let i=0;i<n;i++) {
    const score=data[8*n+i]; // four box coordinates + class 4 (dart tip)
    if(!Number.isFinite(score)||score<confidence)continue;
    let best=4;
    for(let cls=0;cls<7;cls++)if(data[(cls+4)*n+i]>data[(best+4)*n+i])best=cls;
    if(best!==4)continue;
    const x=(data[i]-geometry.left)/geometry.scale+geometry.x,y=(data[n+i]-geometry.top)/geometry.scale+geometry.y;
    const w=data[2*n+i]/geometry.scale,h=data[3*n+i]/geometry.scale;
    if(![x,y,w,h].every(Number.isFinite)||w<=0||h<=0||x<geometry.x||x>=geometry.x+geometry.sourceWidth||y<geometry.y||y>=geometry.y+geometry.sourceHeight)continue;
    candidates.push({x,y,w,h,confidence:score});
  }
  candidates.sort((a,b)=>b.confidence-a.confidence);
  const result=[];
  for(const c of candidates)if(result.every(p=>overlap(c,p)<.5)) {result.push(c);if(result.length===12)break;}
  return result;
}

// Motion provides only a search region. It never supplies the scoring point.
export function changeBounds(current,baseline) {
  if(!current.gridPositions||!current.gridSize||current.length!==baseline.length)return null;
  const size=current.gridSize,r=current.gridRadius||1;let mean=0;
  const means=[0,0,0];
  for(let i=0;i<current.length;i++) {
    mean+=current[i]-baseline[i];
    if(current.fine&&baseline.fine)for(let c=0;c<3;c++)means[c]+=current.fine[3*i+c]-baseline.fine[3*i+c];
  }
  mean/=current.length;for(let c=0;c<3;c++)means[c]/=current.length;
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(let i=0;i<current.length;i++) {
    let changed=Math.abs(current[i]-baseline[i]-mean)>24+Math.max(current.edgeNoise?.[i]||0,baseline.edgeNoise?.[i]||0);
    if(current.fine&&baseline.fine)for(let c=0;c<3;c++)changed ||= Math.abs(current.fine[3*i+c]-baseline.fine[3*i+c]-means[c])>18+(baseline.fineNoise?.[i]||0)*.8;
    if(!changed)continue;
    const p=current.gridPositions[i],x=(2*(p%size+.5)/size-1)*r,y=(2*(Math.floor(p/size)+.5)/size-1)*r;
    minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
  }
  return Number.isFinite(minX)?{minX,minY,maxX,maxY}:null;
}
export function confirmTipLocations(hits,tips,board) {
  let changed=false;
  const occupied=hits.filter(h=>h.board===board&&h.point).map(h=>h.point);
  for(const hit of hits) {
    if(hit.board!==board||hit.point||hit.corrected||hit.manuallyUnknown||(hit.tipAttempts||0)>=8)continue;
    hit.tipAttempts=(hit.tipAttempts||0)+1;
    const b=hit.bounds;
    if(!b) {hit.tipCandidate=null;continue;}
    const candidates=tips.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.hypot(p.x,p.y)<=1.34&&
      p.x>=b.minX-.035&&p.x<=b.maxX+.035&&p.y>=b.minY-.035&&p.y<=b.maxY+.035&&
      occupied.every(old=>Math.hypot(p.x-old.x,p.y-old.y)>.025));
    if(candidates.length!==1) {hit.tipCandidate=null;continue;}
    const point=candidates[0],previous=hit.tipCandidate;
    if(previous&&Math.hypot(point.x-previous.x,point.y-previous.y)<=.02) {
      const frames=previous.frames+1;
      hit.tipCandidate={x:(previous.x*previous.frames+point.x)/frames,y:(previous.y*previous.frames+point.y)/frames,frames};
    } else hit.tipCandidate={x:point.x,y:point.y,frames:1};
    if(hit.tipCandidate.frames>=3) {
      hit.point={x:hit.tipCandidate.x,y:hit.tipCandidate.y};hit.tipConfidence=point.confidence;
      occupied.push(hit.point);hit.tipCandidate=null;changed=true;
    }
  }
  return changed;
}
