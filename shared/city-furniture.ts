import { BUILDINGS, CITY_GRID } from './city.js';
import { CHUNK_SIZE, CITY_BASE, hash2 } from './world.js';

/** The same object descriptions drive instanced rendering and Rapier colliders. */
export type CityMaterial = 'metal'|'warm'|'copper'|'garden'|'shrub';
export interface CityProp {
  id:string; mat:CityMaterial; x:number;y:number;z:number;
  w:number;h:number;d:number; solid:boolean;
}
const props:CityProp[]=[];
function box(id:string,mat:CityMaterial,x:number,y:number,z:number,w:number,h:number,d:number,solid=false){
  props.push({id,mat,x,y,z,w,h,d,solid});
}
const occupied=new Set(BUILDINGS.map(b=>b.id));
for(let ix=-6;ix<=5;ix++)for(let iz=-10;iz<=-2;iz++){
  const x=(ix+.5)*CITY_GRID,z=(iz+.5)*CITY_GRID;
  const lot=ix+':'+iz;
  if(!occupied.has(lot)){
    box(lot+':park','garden',x,CITY_BASE+.09,z,42,.19,42);
    for(let t=0;t<7;t++){
      const tx=x+(hash2(ix*61+t,iz*13)-.5)*30;
      const tz=z+(hash2(ix*21+t,iz*71)-.5)*30;
      box(lot+':shrub-'+t,'shrub',tx,CITY_BASE+1,tz,2.5,2,2.5);
      box(lot+':park-post-'+t,'metal',tx,CITY_BASE+2.9,tz,.3,3,.3,true);
    }
  }
  for(const side of [-1,1]){
    const lx=x+side*24,lz=z-22,suffix=lot+':side-'+side;
    box(suffix+':lamp-post','metal',lx,CITY_BASE+4.3,lz,.18,8.6,.18,true);
    box(suffix+':lamp-arm','metal',lx+side*1.15,CITY_BASE+8.6,lz,2.5,.15,.15,true);
    box(suffix+':lamp-head','warm',lx+side*2.2,CITY_BASE+8.52,lz,.65,.16,.5);
    if((ix+iz)%2===0){
      box(suffix+':bin','metal',x+side*23,CITY_BASE+.5,z+12,.7,1,.7,true);
      box(suffix+':bin-top','copper',x+side*23,CITY_BASE+.7,z+12,.75,.12,.75);
    }
  }
}
export const CITY_PROPS:readonly CityProp[]=props;
/** Each prop belongs to exactly one tile, allowing resource-safe eviction. */
export function cityPropsForChunk(cx:number,cz:number):CityProp[]{
  const x0=cx*CHUNK_SIZE-CHUNK_SIZE/2,x1=x0+CHUNK_SIZE;
  const z0=cz*CHUNK_SIZE-CHUNK_SIZE/2,z1=z0+CHUNK_SIZE;
  return props.filter(p=>p.x>=x0&&p.x<x1&&p.z>=z0&&p.z<z1);
}
