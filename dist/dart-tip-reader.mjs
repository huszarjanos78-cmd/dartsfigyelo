export function createDartTipReader() {
  const worker=new Worker(new URL('./dart-tip-worker.mjs?v=0.12.0',import.meta.url),{type:'module'});
  let sequence=0,stopped=false;
  const requests=new Map();
  const fail=error=>{for(const {reject,timer} of requests.values()){clearTimeout(timer);reject(error);}requests.clear();};
  worker.onmessage=({data})=>{
    const request=requests.get(data.id);if(!request)return;
    clearTimeout(request.timer);requests.delete(data.id);
    if(data.error)request.reject(new Error(data.error));else request.resolve(data);
  };
  worker.onerror=event=>{stopped=true;worker.terminate();fail(new Error(event.message||'A nyílhegy-felismerő nem indítható.'));};
  return {
    read(image,crop) {
      if(stopped)return Promise.reject(new Error('Dart detector stopped'));
      if(requests.size)return Promise.reject(new Error('Dart detector busy'));
      return new Promise((resolve,reject)=>{
        const id=++sequence;
        const timer=setTimeout(()=>{stopped=true;worker.terminate();fail(new Error('A nyílhegy-felismerés időtúllépése.'));},45000);
        requests.set(id,{resolve,reject,timer});
        const data=new Uint8ClampedArray(image.data);
        worker.postMessage({id,image:{width:image.width,height:image.height,data},crop},[data.buffer]);
      });
    },
    stop() {stopped=true;worker.terminate();fail(new Error('Dart detector stopped'));}
  };
}
