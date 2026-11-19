import * as ort from './vendor/ort/ort.wasm.min.mjs';
import {prepareTipInput,decodeTips,TIP_INPUT_SIZE} from './dart-tip-core.mjs?v=0.12.0';
ort.env.wasm.numThreads=1;
ort.env.wasm.proxy=false;
ort.env.wasm.wasmPaths=new URL('./vendor/ort/',import.meta.url).href;
let session;
self.onmessage=async ({data})=>{
  const {id,image,crop}=data;
  let input,outputs;
  try {
    if(!session)session=await ort.InferenceSession.create(new URL('./models/dart-tip.onnx',import.meta.url).href,{executionProviders:['wasm'],graphOptimizationLevel:'all'});
    const start=performance.now(),{tensor,geometry}=prepareTipInput(image,crop);
    input=new ort.Tensor('float32',tensor,[1,3,TIP_INPUT_SIZE,TIP_INPUT_SIZE]);
    outputs=await session.run({[session.inputNames[0]]:input});
    const output=outputs[session.outputNames[0]];
    self.postMessage({id,tips:decodeTips(output.data,output.dims,geometry),milliseconds:performance.now()-start});
  } catch(error) {self.postMessage({id,error:error.message||String(error)});}
  finally {input?.dispose();for(const output of Object.values(outputs||{}))output.dispose();}
};
