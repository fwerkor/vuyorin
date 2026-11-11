import type { ScenicRock, ScenicTree } from '../shared/city';
import { CHUNK_SIZE } from '../shared/world';
import type { TerrainRequest } from './terrain-data';

export interface LoadedChunk extends TerrainRequest {
  positions:Float32Array; colors:Float32Array; indices:Uint32Array;
  trees:ScenicTree[]; rocks:ScenicRock[];
}
export function decodeTile(data:ArrayBuffer, req:TerrainRequest):LoadedChunk {
  const view=new DataView(data);
  if(view.byteLength<16 || view.getUint32(0,true)!==0x32525956 || view.getUint16(4,true)!==1)
    throw new Error('Invalid pre-baked world chunk');
  const n=view.getUint16(6,true);
  if(n!==33)throw new Error('Unexpected tile geometry resolution');
  const nt=view.getUint16(8,true),nr=view.getUint16(10,true);
  const vertexCount=n*n, expected=16+vertexCount*5+(nt+nr)*20;
  if(expected!==data.byteLength)throw new Error('Unexpected tile byte length');
  let p=16;
  const sourceHeights=new Float32Array(vertexCount);
  for(let i=0;i<vertexCount;i++){sourceHeights[i]=view.getInt16(p,true)/16;p+=2;}
  const sourceColors=new Uint8Array(data,p,vertexCount*3);
  p+=sourceColors.length;
  const trees:ScenicTree[]=[],rocks:ScenicRock[]=[];
  for(let i=0;i<nt+nr;i++){
    const values:number[]=[];
    for(let j=0;j<5;j++){values.push(view.getFloat32(p,true));p+=4;}
    if(i<nt)trees.push({x:values[0],y:values[1],z:values[2],scale:values[3],kind:values[4]});
    else rocks.push({x:values[0],y:values[1],z:values[2],scale:values[3],spin:values[4]});
  }
  const stride=req.lod===0?1:req.lod===1?2:4, steps=(n-1)/stride;
  const main=(steps+1)*(steps+1);
  const positions=new Float32Array((main+4*(steps+1))*3);
  const colors=new Float32Array(positions.length);
  const indices:number[]=[];
  for(let iz=0;iz<=steps;iz++)for(let ix=0;ix<=steps;ix++){
    const si=(iz*stride*n+ix*stride),di=(iz*(steps+1)+ix)*3;
    positions[di]=(ix/steps-.5)*CHUNK_SIZE;
    positions[di+1]=sourceHeights[si];
    positions[di+2]=(iz/steps-.5)*CHUNK_SIZE;
    for(let c=0;c<3;c++)colors[di+c]=sourceColors[si*3+c]/255;
  }
  for(let iz=0;iz<steps;iz++)for(let ix=0;ix<steps;ix++){
    const a=iz*(steps+1)+ix,b=a+steps+1;
    indices.push(a,b,a+1,b,b+1,a+1);
  }
  // Shared-height grid and outer skirts keep terrain gaps unobtrusive at different LODs.
  let skirt=main;
  for(let side=0;side<4;side++){
    for(let i=0;i<=steps;i++){
      const old=side===0?i:side===1?steps*(steps+1)+i:side===2?i*(steps+1):(i+1)*(steps+1)-1;
      const off=old*3,dst=(skirt+i)*3;
      positions[dst]=positions[off];positions[dst+1]=positions[off+1]-13;
      positions[dst+2]=positions[off+2];
      for(let c=0;c<3;c++)colors[dst+c]=colors[off+c]*.73;
      if(i<steps){
        const next=side<2?old+1:old+steps+1;
        indices.push(old,next,skirt+i,next,skirt+i+1,skirt+i);
      }
    }
    skirt+=steps+1;
  }
  return {...req,positions,colors,indices:Uint32Array.from(indices),trees,rocks};
}
