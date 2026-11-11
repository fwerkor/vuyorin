/**
 * VUYORIN World v1 offline baker.
 *
 * Run explicitly (npm run bake:world) during publishing. Every chunk is immutable,
 * pre-computed and served as static content. No terrain generation in the browser.
 * Binary layout, little-endian:
 * [0..3] "VYR2", [4..5] uint16 format version, [6..7] uint16 samples,
 * [8..9] uint16 tree count, [10..11] uint16 rock count, [12..15] reserved,
 * [16..] (samples^2) int16 heights at 1/16 m, then RGB888 colors,
 * then for each tree/rock 5 float32: x,y,z,size,kind|rotation.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { CHUNK_SIZE, SPAWN, WORLD_LIMIT } from '../shared/world.js';
import { createTerrainData, withinWorld } from '../client/terrain-data.js';
import { sceneryForChunk, BUILDINGS } from '../shared/city.js';

const output=resolve(process.argv[2] || 'client/public/world/v1');
const ver=1, N=33;
async function bake(cx:number,cz:number){
  const result=createTerrainData({key:cx+','+cz,cx,cz,lod:0});
  const trees=sceneryForChunk(cx,cz).trees, rocks=sceneryForChunk(cx,cz).rocks;
  const len=N*N, bytes=16+len*5+(trees.length+rocks.length)*20;
  const payload=Buffer.allocUnsafe(bytes), view=new DataView(payload.buffer,payload.byteOffset,payload.byteLength);
  payload.write('VYR2',0,'ascii');
  view.setUint16(4,ver,true);view.setUint16(6,N,true);
  view.setUint16(8,trees.length,true);view.setUint16(10,rocks.length,true);view.setUint32(12,0,true);
  let ptr=16;
  for(let i=0;i<len;i++){view.setInt16(ptr,Math.round(result.positions[i*3+1]*16),true);ptr+=2;}
  for(let i=0;i<len;i++)for(let c=0;c<3;c++)
    payload[ptr++]=Math.max(0,Math.min(255,Math.round(result.colors[i*3+c]*255)));
  for(const e of [...trees.map(t=>[t.x,t.y,t.z,t.scale,t.kind]),...rocks.map(r=>[r.x,r.y,r.z,r.scale,r.spin])]){
    for(const number of e){view.setFloat32(ptr,number,true);ptr+=4;}
  }
  if(ptr!==bytes)throw new Error('Corrupted chunk layout '+ptr+' vs '+bytes);
  await writeFile(join(output,`${cx}_${cz}.bin`),payload);
  return bytes;
}
await mkdir(output,{recursive:true});
let count=0,bytes=0;
const radius=Math.floor((WORLD_LIMIT-CHUNK_SIZE/2)/CHUNK_SIZE);
for(let z=-radius;z<=radius;z++){
  for(let x=-radius;x<=radius;x++){
    if(!withinWorld(x,z))continue;
    bytes+=await bake(x,z);count++;
  }
  if(z%8===0)console.log(`bake progress ${z+radius+1}/${radius*2+1} rows, ${count} chunks`);
}
const manifest={
  format:2, worldVersion:'v1', name:'VUYORIN · 雾曜纪', chunkSize:CHUNK_SIZE,
  worldLimit:WORLD_LIMIT, sizeKm:[3.936,3.936], totalChunks:count, spawn:SPAWN,
  assets:'world/v1/{cx}_{cz}.bin', cityBuildings:BUILDINGS.length,
  bakedAt:new Date().toISOString()
};
await writeFile(join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(`Baked ${count} chunks, ${(bytes/1048576).toFixed(2)} MiB uncompressed`);
