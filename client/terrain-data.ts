import { CHUNK_SIZE, WORLD_LIMIT, hash2, terrainHeight, terrainBiome } from '../shared/world';

export interface TerrainRequest { key:string; cx:number; cz:number; lod:number }
export interface TerrainResult extends TerrainRequest { positions:Float32Array; colors:Float32Array; indices:Uint32Array }
const SEGMENTS=[32,16,8];
function paint(x:number,z:number,h:number):[number,number,number] {
  const biome=terrainBiome(x,z);
  const scatter=hash2(x*.38,z*.41)*.09-.045;
  const colors:Record<string,[number,number,number]>={
    city:[.29,.34,.35], beach:[.44,.41,.31], forest:[.17,.30,.22],
    alpine:[.33,.37,.33], snow:[.71,.75,.76], seabed:[.14,.27,.28]
  };
  const c=colors[biome];
  // Rocky scarps alternate with vegetation; snow appears near the summits.
  const dyx=terrainHeight(x+2,z)-terrainHeight(x-2,z);
  const dyz=terrainHeight(x,z+2)-terrainHeight(x,z-2);
  const grade=Math.hypot(dyx,dyz)/4;
  const rock=Math.min(1,Math.max(0,(grade-.45)*1.1));
  const snow=Math.min(1,Math.max(0,(h-160)/65));
  return [0,1,2].map(i=>Math.max(0,Math.min(1,
    ((c[i]+scatter)*(1-rock)+([.37,.38,.37][i]+scatter*.5)*rock)*(1-snow)+[.83,.86,.86][i]*snow))) as [number,number,number];
}
export function createTerrainData(req:TerrainRequest):TerrainResult {
  const {cx,cz,lod,key}=req;
  const n=SEGMENTS[lod]??8,span=CHUNK_SIZE;
  const count=(n+1)*(n+1);
  const positions=new Float32Array((count+4*(n+1))*3);
  const colors=new Float32Array(positions.length);
  const triangles:number[]=[];
  const put=(i:number,x:number,y:number,z:number,r:number,g:number,b:number)=>{
    const p=i*3;
    positions[p]=x;positions[p+1]=y;positions[p+2]=z;
    colors[p]=r;colors[p+1]=g;colors[p+2]=b;
  };
  for(let iz=0;iz<=n;iz++)for(let ix=0;ix<=n;ix++){
    const lx=(ix/n-.5)*span,lz=(iz/n-.5)*span;
    const x=cx*span+lx,z=cz*span+lz;
    const h=terrainHeight(x,z);
    const c=paint(x,z,h);
    put(iz*(n+1)+ix,lx,h,lz,...c);
  }
  for(let iz=0;iz<n;iz++)for(let ix=0;ix<n;ix++){
    const a=iz*(n+1)+ix,b=a+n+1;
    triangles.push(a,b,a+1,b,b+1,a+1);
  }
  // Vertical skirts hide LOD T-junctions without modifying shared edge heights.
  let start=count;
  for(let side=0;side<4;side++){
    for(let i=0;i<=n;i++){
      const old=side===0?i:side===1?n*(n+1)+i:side===2?i*(n+1):(i+1)*(n+1)-1;
      const idx=start+i, base=old*3;
      put(idx,positions[base],positions[base+1]-16,positions[base+2],
        colors[base]*.7,colors[base+1]*.7,colors[base+2]*.7);
      if(i<n){
        const nextOld=side===0?old+1:side===1?old+1:side===2?old+n+1:old+n+1;
        triangles.push(old,nextOld,idx, nextOld,start+i+1,idx);
      }
    }
    start+=n+1;
  }
  return {key,cx,cz,lod,positions,colors,indices:Uint32Array.from(triangles)};
}
export function withinWorld(cx:number,cz:number):boolean {
  return Math.abs(cx*CHUNK_SIZE)<=WORLD_LIMIT-CHUNK_SIZE/2 &&
    Math.abs(cz*CHUNK_SIZE)<=WORLD_LIMIT-CHUNK_SIZE/2;
}
