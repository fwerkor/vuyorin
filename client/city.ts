import * as THREE from 'three';
import { BUILDINGS, CITY_GRID, buildingsForChunk, type Building } from '../shared/city';
import { CHUNK_SIZE, CITY_BASE, hash2 } from '../shared/world';

const cube = new THREE.BoxGeometry(1,1,1);
const surface = (color:string,roughness=.8,metalness=.05,emissive?:string) =>
  new THREE.MeshStandardMaterial({color,roughness,metalness,emissive:emissive||'#000000',
    emissiveIntensity:emissive ? .8 : 0});
const M = {
  road:surface('#192630',.35,.2), sidewalk:surface('#777c78',.87), grout:surface('#374147',.88),
  glass:surface('#2e4b60',.19,.68), lit:surface('#f4bc79',.25,.1,'#d89250'),
  blue:surface('#8cb5c3',.3,.34,'#214d69'), concrete:surface('#77818a',.8),
  brick:surface('#7b5045',.85), pale:surface('#afb0a5',.73), stone:surface('#4d565c',.79),
  metal:surface('#313d42',.39,.71), copper:surface('#b67a48',.36,.63),
  paint:surface('#e7ddbc',.9), yellow:surface('#d9ab5c',.9),
  garden:surface('#345844',.96), shrub:surface('#487253',.97),
  warm:surface('#fff0bd',.25,.1,'#ffe4a3')
};
type MatKey = keyof typeof M;
interface Instance {x:number;y:number;z:number;w:number;h:number;d:number;rotation?:number}
class BoxBatch {
  private specs = new Map<MatKey,Instance[]>();
  add(mat:MatKey,x:number,y:number,z:number,w:number,h:number,d:number,rotation=0){
    let list=this.specs.get(mat);if(!list){list=[];this.specs.set(mat,list);}
    list.push({x,y,z,w,h,d,rotation});
  }
  finish(group:THREE.Group){
    const dummy=new THREE.Object3D();
    for(const [key,list] of this.specs){
      if(!list.length)continue;
      const mesh=new THREE.InstancedMesh(cube,M[key],list.length);
      mesh.castShadow=key!=='glass'&&key!=='lit'&&key!=='blue'&&key!=='road'&&key!=='paint';
      mesh.receiveShadow=true;
      list.forEach((p,i)=>{
        dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,p.rotation||0,0);
        dummy.scale.set(p.w,p.h,p.d);dummy.updateMatrix();
        mesh.setMatrixAt(i,dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate=true;
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
  }
}
function facade(batch:BoxBatch,b:Building,detail:number){
  const {x,z,w,d,h,floors}=b,base=CITY_BASE;
  const body:MatKey = (['glass','brick','concrete','pale'] as MatKey[])[b.style];
  batch.add(body,x,base+h/2,z,w,h,d);
  batch.add('metal',x,base+h+.14,z,w+.55,.28,d+.55);
  const trim:MatKey=b.style===1?'copper':'stone';
  if(detail===2){
    if(b.style===0){
      for(let iy=3;iy<floors;iy+=5)
        batch.add('blue',x,base+iy*3.45,z+d/2+.045,w-2,2.7,.08);
    }
    return;
  }
  const step=detail===0?3.3:6.8;
  const floorSkip=detail===0?1:2;
  const windowWidth=detail===0?1.8:3.7;
  for(let fi=1;fi<floors;fi+=floorSkip){
    const y=base+fi*3.45+1.45;
    for(let col=-w/2+2.4;col<w/2-1.3;col+=step){
      const lit=hash2((x+col)*.28,(z+fi)*.46);
      const glass:MatKey=lit>.72?'lit':lit>.45?'blue':'glass';
      batch.add(glass,x+col,y,z+d/2+.085,windowWidth,2.1*floorSkip,.10);
      batch.add(glass,x+col,y,z-d/2-.085,windowWidth,2.1*floorSkip,.10);
    }
    for(let col=-d/2+2.4;col<d/2-1.3;col+=step){
      const glass:MatKey=hash2((z+col)*.31,fi+x)>.78?'lit':'glass';
      batch.add(glass,x+w/2+.085,y,z+col,.10,2.1*floorSkip,windowWidth);
      batch.add(glass,x-w/2-.085,y,z+col,.10,2.1*floorSkip,windowWidth);
    }
    if(detail===0 && fi%3===0){
      batch.add(trim,x,base+fi*3.45+.1,z+d/2+.18,w+.3,.15,.25);
      batch.add(trim,x,base+fi*3.45+.1,z-d/2-.18,w+.3,.15,.25);
    }
  }
  if(detail!==0)return;
  // Building entrances, ground-floor retail, cornices and HVAC details.
  batch.add('metal',x,base+2,z+d/2+.13,w-2,3.3,.18);
  const shops=Math.max(2,Math.floor((w-2)/5));
  for(let i=0;i<shops;i++){
    const sx=x-w/2+2.5+i*(w-4)/shops;
    batch.add(i%3?'glass':'lit',sx,base+1.85,z+d/2+.25,3.4,2.8,.11);
    batch.add('copper',sx,base+3.5,z+d/2+.4,4.2,.38,.72);
  }
  for(let i=0;i<3;i++){
    const px=x+(hash2(x+i*3,z)-.5)*w*.62,pz=z+(hash2(x,z+i*7)-.5)*d*.62;
    batch.add('metal',px,base+h+.6,pz,2+hash2(i,x)*3,1.15,2.2);
  }
  if(b.style===0 && h>50){
    batch.add('warm',x,base+h+.9,z,.24,1.7,.24);
    batch.add('metal',x,base+h+3.1,z,.08,4,.08);
  }
}
function streets(batch:BoxBatch,cx:number,cz:number,lod:number){
  const x=cx*CHUNK_SIZE,z=cz*CHUNK_SIZE,half=CHUNK_SIZE/2;
  if(Math.abs(x)>390||z<-620||z>20)return;
  const x0=Math.max(-336,x-half),x1=Math.min(336,x+half);
  const z0=Math.max(-565,z-half),z1=Math.min(-48,z+half);
  if(x1<=x0||z1<=z0)return;
  batch.add('sidewalk',(x0+x1)/2,CITY_BASE+.065,(z0+z1)/2,x1-x0,.13,z1-z0);
  const vx=Math.ceil((x0-7)/CITY_GRID),ux=Math.floor((x1+7)/CITY_GRID);
  for(let n=vx;n<=ux;n++){
    const gx=n*CITY_GRID;
    const left=Math.max(x0,gx-6.8),right=Math.min(x1,gx+6.8);
    if(right>left)batch.add('road',(left+right)/2,CITY_BASE+.085,(z0+z1)/2,right-left,.085,z1-z0);
    if(lod===0 && gx>=x0&&gx<=x1){
      for(let k=Math.ceil(z0/13);k<Math.floor(z1/13);k++){
        const mz=k*13+3.2;
        if(mz+3<z0||mz-3>z1||Math.abs((mz/CITY_GRID)-Math.round(mz/CITY_GRID))<.25)continue;
        batch.add('paint',gx,CITY_BASE+.137,mz,.12,.008,3.2);
      }
    }
  }
  const vz=Math.ceil((z0-7)/CITY_GRID),uz=Math.floor((z1+7)/CITY_GRID);
  for(let n=vz;n<=uz;n++){
    const gz=n*CITY_GRID;
    const low=Math.max(z0,gz-6.8),high=Math.min(z1,gz+6.8);
    if(high>low)batch.add('road',(x0+x1)/2,CITY_BASE+.085,(low+high)/2,x1-x0,.09,high-low);
    if(lod===0 && gz>=z0&&gz<=z1){
      for(let k=Math.ceil(x0/13);k<Math.floor(x1/13);k++){
        const mx=k*13+3.3;
        if(mx+3>x1||mx-3<x0||Math.abs((mx/CITY_GRID)-Math.round(mx/CITY_GRID))<.25)continue;
        batch.add('paint',mx,CITY_BASE+.137,gz,3.3,.009,.12);
      }
    }
  }
  if(lod!==0)return;
  // Crosswalks and corner bollards at intersections.
  for(let ix=vx;ix<=ux;ix++)for(let iz=vz;iz<=uz;iz++){
    const rx=ix*CITY_GRID,rz=iz*CITY_GRID;
    if(rx<x0+8||rx>x1-8||rz<z0+8||rz>z1-8)continue;
    for(let j=-4;j<=4;j++) {
      batch.add('paint',rx+j*1.65,CITY_BASE+.137,rz+9,1,.01,3.1);
      batch.add('paint',rx+j*1.65,CITY_BASE+.137,rz-9,1,.01,3.1);
    }
    for(const dx of [-9,9])for(const dz of [-9,9]){
      batch.add('metal',rx+dx,CITY_BASE+.75,rz+dz,.15,1.35,.15);
      batch.add('warm',rx+dx,CITY_BASE+1.52,rz+dz,.23,.23,.23);
    }
  }
}
function furniture(batch:BoxBatch,cx:number,cz:number){
  const x0=cx*CHUNK_SIZE-CHUNK_SIZE/2,x1=x0+CHUNK_SIZE;
  const z0=cz*CHUNK_SIZE-CHUNK_SIZE/2,z1=z0+CHUNK_SIZE;
  for(let ix=-6;ix<=5;ix++)for(let iz=-10;iz<=-2;iz++){
    const x=(ix+.5)*CITY_GRID,z=(iz+.5)*CITY_GRID;
    if(x<x0||x>=x1||z<z0||z>=z1)continue;
    const lot=BUILDINGS.find(b=>b.id===ix+':'+iz);
    if(!lot){
      batch.add('garden',x,CITY_BASE+.09,z,42,.19,42);
      for(let t=0;t<7;t++){
        const tx=x+(hash2(ix*61+t,iz*13)-.5)*30;
        const tz=z+(hash2(ix*21+t,iz*71)-.5)*30;
        batch.add('shrub',tx,CITY_BASE+1,tz,2.5,2,2.5);
        batch.add('metal',tx,CITY_BASE+2.9,tz,.3,3,.3);
      }
    }
    // Streetlamp poles, illuminated heads, bins, benches and bollards.
    for(const side of [-1,1]){
      const lx=x+side*24,lz=z-22;
      batch.add('metal',lx,CITY_BASE+4.3,lz,.18,8.6,.18);
      batch.add('metal',lx+side*1.15,CITY_BASE+8.6,lz,2.5,.15,.15);
      batch.add('warm',lx+side*2.2,CITY_BASE+8.52,lz,.65,.16,.5);
      if((ix+iz)%2===0){
        batch.add('metal',x+side*23,CITY_BASE+.5,z+12,.7,1,.7);
        batch.add('copper',x+side*23,CITY_BASE+.7,z+12,.75,.12,.75);
      }
    }
  }
}
export function makeCityChunk(cx:number,cz:number,lod:number):THREE.Group{
  const group=new THREE.Group();
  const batch=new BoxBatch();
  streets(batch,cx,cz,lod);
  for(const b of buildingsForChunk(cx,cz)){
    batch.add('sidewalk',b.x,CITY_BASE+.13,b.z,CITY_GRID-14,.26,CITY_GRID-14);
    facade(batch,b,lod);
  }
  if(lod===0)furniture(batch,cx,cz);
  batch.finish(group);
  return group;
}
