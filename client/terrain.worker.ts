import { decodeTile, type LoadedChunk } from './terrain-binary';
import type { TerrainRequest } from './terrain-data';

interface ErrorResponse { key:string; error:string }
const cache=new Map<string,ArrayBuffer>();
self.onmessage = async (event: MessageEvent<TerrainRequest>) => {
  const task=event.data;
  try {
    const key=task.cx+'_'+task.cz;
    let bytes=cache.get(key);
    if(!bytes){
      const resp=await fetch(`/world/v1/${key}.bin`,{cache:'force-cache'});
      if(!resp.ok)throw new Error('map asset HTTP '+resp.status);
      bytes=await resp.arrayBuffer();
      cache.set(key,bytes);
      if(cache.size>96)cache.delete(cache.keys().next().value!);
    }
    const output:LoadedChunk=decodeTile(bytes,task);
    (self as unknown as {postMessage: (value:unknown, transfer?:Transferable[])=>void}).postMessage(output,
      [output.positions.buffer,output.colors.buffer,output.indices.buffer]);
  } catch(e){
    const problem:ErrorResponse={key:task.key,error:String(e)};
    (self as unknown as {postMessage: (value:unknown, transfer?:Transferable[])=>void}).postMessage(problem);
  }
};
