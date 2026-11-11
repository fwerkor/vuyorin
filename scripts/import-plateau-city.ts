/**
 * Import one verified PLATEAU/CodePawl city tile for the isolated real-city
 * exploration pilot. Do not fetch any network resources in the game runtime.
 *
 * Source: MLIT PLATEAU / Yokohama City (2020), modified by CodePawl.
 * License: CC BY 4.0; see docs/real-city-license.md.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const tile='yokohama-53391550';
const source='https://huggingface.co/datasets/codepawl/plateau-city-glb/resolve/main/';
const files=[
  {
    name: 'visual',
    remote: `objects/${tile}/${tile}.glb`,
    sha256: 'fac0332657ce08dd98102e475bc05f3831edb4755e4e53907e982b6e33e0d6ce'
  },
  {
    name: 'collision',
    remote: `collision/${tile}/${tile}_collision.glb`,
    sha256: 'f49b2c8291f52df50f37c7411df1e5fc94ba9b408483e0a6044bb7549632b980'
  }
] as const;
const dir=resolve('client/public/world/city');
await mkdir(dir,{recursive:true});
async function verifiedFile(f:typeof files[number]):Promise<Buffer>{
  const path=join(dir,tile+(f.name==='collision'?'_source_collision':'')+'.glb');
  try{
    const bytes=await readFile(path);
    if(createHash('sha256').update(bytes).digest('hex')===f.sha256)return bytes;
  }catch{ /* not cached */ }
  for(let attempt=0;attempt<3;attempt++){
    try{
      const url=source+f.remote;
      const response=await fetch(url,{signal:AbortSignal.timeout(45000)});
      if(!response.ok)throw new Error('HTTP '+response.status);
      const bytes=Buffer.from(await response.arrayBuffer());
      if(createHash('sha256').update(bytes).digest('hex')!==f.sha256)throw new Error('SHA256 mismatch');
      await writeFile(path+'.tmp',bytes);
      await rename(path+'.tmp',path);
      return bytes;
    }catch(error){
      console.warn('Download failed',f.name,attempt+1,String(error));
    }
  }
  throw new Error('Verified city tile unavailable: '+f.name);
}
const visual=await verifiedFile(files[0]);
const collision=await verifiedFile(files[1]);

interface Accessor {bufferView:number;byteOffset?:number;componentType:number;count:number;type:string}
interface View {buffer:number;byteOffset?:number;byteStride?:number;byteLength:number}
interface GlbDocument {
  accessors:Accessor[];bufferViews:View[];
  meshes:Array<{name:string;primitives:Array<{attributes:{POSITION:number};indices:number}>}>;
}
function parseGlb(buffer:Buffer):{json:GlbDocument;data:Buffer}{
  if(buffer.toString('ascii',0,4)!=='glTF'||buffer.readUInt32LE(4)!==2||buffer.readUInt32LE(8)!==buffer.length)
    throw new Error('Unsupported GLB container');
  const jlen=buffer.readUInt32LE(12);
  if(buffer.toString('ascii',16,20)!=='JSON')throw new Error('Missing JSON chunk');
  const json=JSON.parse(buffer.toString('utf8',20,20+jlen)) as GlbDocument;
  const binChunkOffset=20+jlen;
  if(buffer.toString('ascii',binChunkOffset+4,binChunkOffset+8)!=='BIN\0')throw new Error('Missing binary buffer');
  return {json,data:buffer.subarray(binChunkOffset+8)};
}
const parsed=parseGlb(collision);
function getArray(index:number):Buffer{
  const a=parsed.json.accessors[index];
  const view=parsed.json.bufferViews[a.bufferView];
  if(view.buffer!==0||view.byteStride)throw new Error('Unsupported strided/interleaved collision geometry');
  const per=a.type==='VEC3'&&a.componentType===5126?12:a.type==='SCALAR'&&a.componentType===5125?4:0;
  if(per===0)throw new Error('Unsupported accessor type');
  const pos=(view.byteOffset||0)+(a.byteOffset||0);
  const len=a.count*per;
  if(pos+len>parsed.data.length)throw new Error('Accessor past end of buffer');
  return parsed.data.subarray(pos,pos+len);
}
// A single static trimesh for each of terrain and LOD1 buildings, plus
// a distinct surface query to derive ground height on both peers.
const pairs=parsed.json.meshes.map(m=>{
  const primitive=m.primitives[0];
  return {name:m.name,positions:getArray(primitive.attributes.POSITION),
    indices:getArray(primitive.indices),
    vertexCount:parsed.json.accessors[primitive.attributes.POSITION].count,
    indexCount:parsed.json.accessors[primitive.indices].count};
});
if(pairs.length!==2||!pairs.some(p=>p.name==='collision_buildings_lod1')||
  !pairs.some(p=>p.name==='collision_terrain'))throw new Error('Unexpected city collision layer set');
const length=12+pairs.reduce((sum,m)=>sum+12+m.positions.length+m.indices.length,0);
const output=Buffer.allocUnsafe(length);
output.write('VYRC',0,'ascii');output.writeUInt32LE(1,4);output.writeUInt32LE(pairs.length,8);
let cursor=12;
for(const name of ['collision_terrain','collision_buildings_lod1']){
  const p=pairs.find(m=>m.name===name)!;
  output.writeUInt32LE(name==='collision_terrain'?1:2,cursor);
  output.writeUInt32LE(p.vertexCount,cursor+4);
  output.writeUInt32LE(p.indexCount,cursor+8);cursor+=12;
  p.positions.copy(output,cursor);cursor+=p.positions.length;
  p.indices.copy(output,cursor);cursor+=p.indices.length;
}
if(cursor!==length)throw new Error('Collision output size mismatch');
await writeFile(join(dir,'collision.bin'),output);
await writeFile(join(dir,'manifest.json'),JSON.stringify({
  id:tile,version:1,coordinateSystem:'local y-up metres',
  boundary:[-520,520,-425,425],
  spawn:{x:0,z:0},visual:'/'+join('world/city',tile+'.glb'),
  collision:'/world/city/collision.bin',
  attribution:'MLIT Project PLATEAU / Yokohama City (2020), processed by CodePawl, CC BY 4.0',
  source:'https://huggingface.co/datasets/codepawl/plateau-city-glb',
  visualSha256:files[0].sha256,collisionSourceSha256:files[1].sha256
},null,2)+'\n');
console.log('PLATEAU pilot',pairs.map(p=>({name:p.name,vertices:p.vertexCount,triangles:p.indexCount/3})),
  'bytes',visual.length,'collision binary',length);
