/**
 * HALO EXCHANGE presentation. Shapes come from shared/halo.ts; the server
 * instantiates the exact same solids as Rapier colliders. Only non-physical
 * layers (signage, light halos, material detail) are authored in this file.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Building } from '../shared/city';
import { haloInterior, HALO_LIFT, type HaloPart, type HaloFinish } from '../shared/halo';
import { CITY_BASE } from '../shared/world';

const box=new THREE.BoxGeometry(1,1,1);
const cylinder=new THREE.CylinderGeometry(1,1,1,24);
const sphere=new THREE.IcosahedronGeometry(1,2);
const rounded=new RoundedBoxGeometry(1,1,1,3,.09);
const loader=new THREE.TextureLoader();
const mats=new Map<HaloFinish,THREE.Material>();
const textureFiles:Partial<Record<HaloFinish,string>>={
  blacksteel:'graphite', bronze:'brass', marble:'marble', timber:'walnut',
  terrazzo:'terrazzo',fabric:'fabric'
};
function texture(name:string):THREE.Texture{
  const map=loader.load('/assets/halo/'+name+'.png');
  map.colorSpace=THREE.SRGBColorSpace;
  map.anisotropy=4;
  map.wrapS=map.wrapT=THREE.RepeatWrapping;
  return map;
}
function mat(name:HaloFinish):THREE.Material {
  const existing=mats.get(name);
  if(existing)return existing;
  let result:THREE.Material;
  if(name==='glass'||name==='frosted'){
    result=new THREE.MeshPhysicalMaterial({
      color:name==='glass'?'#92ccdf':'#b9e9e7',
      roughness:name==='glass'?.095:.40,metalness:.20,
      transparent:true,opacity:name==='glass'?.37:.58,
      depthWrite:false,side:THREE.DoubleSide,clearcoat:.9,clearcoatRoughness:.08
    });
  }else if(name==='cyan'||name==='amber'){
    const cyan=name==='cyan';
    result=new THREE.MeshStandardMaterial({
      color:cyan?'#67eaff':'#ffe4ac',
      emissive:cyan?'#13d4ff':'#ffb36c',
      emissiveIntensity:cyan?1.45:1.55,
      roughness:.22,metalness:.12
    });
  }else if(name==='plant'){
    result=new THREE.MeshStandardMaterial({color:'#3e7a62',roughness:.95,flatShading:true});
  }else if(name==='screen'){
    result=new THREE.MeshStandardMaterial({
      color:'#153c48',emissive:'#0c8ba3',emissiveIntensity:1.5,
      roughness:.25,metalness:.5
    });
  }else if(name==='cream'){
    result=new THREE.MeshStandardMaterial({color:'#e3d7c5',roughness:.77});
  }else{
    const roughness:Partial<Record<HaloFinish,number>>={
      blacksteel:.42,bronze:.28,marble:.37,timber:.7,terrazzo:.49,fabric:.91
    };
    const metalness:Partial<Record<HaloFinish,number>>={
      blacksteel:.8,bronze:.66,marble:.05,timber:.02,terrazzo:.11,fabric:0
    };
    result=new THREE.MeshStandardMaterial({
      map:texture(textureFiles[name]!),
      roughness:roughness[name]??.6,metalness:metalness[name]??0
    });
  }
  mats.set(name,result);
  return result;
}
/**
 * Preserve real-size texturing on extensive walls and floors. The Three.js
 * standard box UVs otherwise stretch one texture across a 36-m-long slab.
 */
function geometry(part:HaloPart):THREE.BufferGeometry{
  const upholstered=part.kind==='box'&&part.finish==='fabric';
  const base=upholstered?rounded:part.kind==='box'?box:part.kind==='cylinder'?cylinder:sphere;
  if(part.finish!=='timber' && part.finish!=='terrazzo'
     && part.finish!=='marble' && part.finish!=='blacksteel')return base;
  if(Math.max(part.w,part.d,part.h)<4)return base;
  const geo=base.clone();
  const uv=geo.getAttribute('uv');
  if(part.kind==='box'){
    const faces=[[part.d,part.h],[part.d,part.h],[part.w,part.d],
      [part.w,part.d],[part.w,part.h],[part.w,part.h]];
    for(let face=0;face<6;face++)for(let v=0;v<4;v++){
      const i=face*4+v;
      uv.setXY(i,uv.getX(i)*faces[face][0]/5,uv.getY(i)*faces[face][1]/5);
    }
  }else{
    for(let i=0;i<uv.count;i++)
      uv.setXY(i,uv.getX(i)*part.w/5,uv.getY(i)*part.h/5);
  }
  uv.needsUpdate=true;
  return geo;
}
function addMesh(group:THREE.Group,part:HaloPart,lod:number):void{
  if(lod>part.detail)return;
  // 'sky-ring' and 'aurora-orbit' are intentionally open circular ribbons,
  // never solid disks hiding the decorated rooms.
  if(part.id.startsWith('sky-ring-')||part.id.startsWith('aurora-orbit-')){
    const radius=part.w/2,geo=new THREE.TorusGeometry(radius,.08,8,48);
    const mesh=new THREE.Mesh(geo,mat(part.finish));
    mesh.position.set(part.x,part.y,part.z);
    mesh.rotation.x=Math.PI/2;
    mesh.userData.ownedGeometry=true;
    group.add(mesh);return;
  }
  const geo=geometry(part);
  const mesh=new THREE.Mesh(geo,mat(part.finish));
  mesh.name=part.id;
  mesh.position.set(part.x,part.y,part.z);
  mesh.rotation.y=part.yaw;
  mesh.scale.set(part.kind==='box'?part.w:part.w/2,part.h,
    part.kind==='box'?part.d:part.d/2);
  mesh.castShadow=lod===0&&part.solid&&
    !['glass','frosted','cyan','amber','screen','fabric'].includes(part.finish);
  mesh.receiveShadow=part.finish!=='cyan'&&part.finish!=='amber';
  if(geo!==box&&geo!==rounded&&geo!==cylinder&&geo!==sphere)mesh.userData.ownedGeometry=true;
  group.add(mesh);
}
/** Localized static signs, texture-owned by their chunks. */
function sign(group:THREE.Group,lines:string[],x:number,y:number,z:number,w:number,
  color:'#63ebf4'|'#ffce85'='#63ebf4',yaw=0):void{
  const canvas=document.createElement('canvas');
  canvas.width=1024;canvas.height=256;
  const ctx=canvas.getContext('2d');
  if(!ctx)return;
  ctx.clearRect(0,0,1024,256);
  ctx.fillStyle='rgba(5,18,26,.91)';ctx.fillRect(0,0,1024,256);
  ctx.strokeStyle=color;ctx.lineWidth=6;ctx.strokeRect(9,9,1006,238);
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.shadowColor=color;ctx.shadowBlur=16;
  ctx.fillStyle=color;ctx.font='700 73px Arial, sans-serif';
  ctx.fillText(lines[0],512,lines.length>1?96:131,970);
  if(lines.length>1){
    ctx.shadowBlur=0;
    ctx.fillStyle='#dae6e5';ctx.font='500 43px Arial,sans-serif';
    ctx.fillText(lines[1],512,184,940);
  }
  const tex=new THREE.CanvasTexture(canvas);
  tex.colorSpace=THREE.SRGBColorSpace;
  const mat=new THREE.MeshBasicMaterial({map:tex,transparent:true,side:THREE.DoubleSide,
    depthWrite:false,toneMapped:false});
  const geo=new THREE.PlaneGeometry(w,w*.25);
  const mesh=new THREE.Mesh(geo,mat);
  mesh.position.set(x,y,z);
  mesh.rotation.y=yaw;
  mesh.userData.ownedGeometry=true;mesh.userData.ownedMaterial=true;
  group.add(mesh);
}
function decorativeElements(group:THREE.Group,b:Building,lod:number):void{
  if(lod>=2)return;
  const {x,z}=b;
  // Architectural halo at the tower crown, visible from the harbor.
  for(const [i,r] of [[0,14.85],[1,14.25],[2,13.92]] as const){
    const geo=new THREE.TorusGeometry(r,.17,10,64);
    const mesh=new THREE.Mesh(geo,mat(i===1?'bronze':'cyan'));
    mesh.rotation.x=Math.PI/2;
    mesh.position.set(x,CITY_BASE+25.3-i*3.8,z);
    mesh.userData.ownedGeometry=true;group.add(mesh);
  }
  if(lod!==0)return;
  // Four warm pools of light and cyan-blue light cove accents.
  const lamps=[
    [x-9,CITY_BASE+5.8,z+7,'#ffcda0',15,20],
    [x+8,CITY_BASE+5.5,z-5,'#79deef',11,19],
    [x-11,CITY_BASE+11,z-11,'#e8d9b0',10,17],
    [x+2,CITY_BASE+23.0,z+1,'#afedf9',17,24]
  ] as const;
  for(const [lx,ly,lz,color,intensity,range] of lamps){
    const light=new THREE.PointLight(color,intensity,range,2);
    light.position.set(lx,ly,lz);group.add(light);
  }
  // Suspended elliptical chandelier, designed to read from the lobby below.
  for(let i=0;i<3;i++){
    const geo=new THREE.TorusGeometry(3.8-i*.8,.11,8,52);
    const mesh=new THREE.Mesh(geo,mat(i===0?'cyan':'bronze'));
    mesh.rotation.x=Math.PI/2+(.09+i*.11);
    mesh.position.set(x,CITY_BASE+11.9-i*.65,z);
    mesh.userData.ownedGeometry=true;group.add(mesh);
  }
  sign(group,['HALO EXCHANGE','PUBLIC ATRIUM · OPEN 24/7'],x,
    CITY_BASE+6.2,z+18.35,8.7);
  sign(group,['CONCIERGE','DISTRICT INFORMATION'],x-8.4,CITY_BASE+4.4,z+14.14,5.8,'#ffce85');
  sign(group,['NIGHT COFFEE','ROASTERS · NORTH WING'],x-11.5,CITY_BASE+3.6,z-13.6,6.2,'#ffce85');
  sign(group,['LEVEL 02','GALLERY / ATRIUM'],x-1,CITY_BASE+9.2,z+15.7,5.3);
  sign(group,['SKY LOUNGE','PANORAMIC OBSERVATORY'],x,CITY_BASE+22.4,z-13.0,6.1);
  sign(group,['E · SKY LIFT','LEVELS 01 · 02 · 03'],HALO_LIFT.x,
    CITY_BASE+4.1,HALO_LIFT.z-1.68,3.6);
  sign(group,['MAIN ATRIUM','GALLERY · CAFE · LOUNGE'],x-6,
    CITY_BASE+10.4,z-6.9,5.1,'#ffce85');
  // HaloExchange's data sculpture uses physically present pedestals,
  // illuminated transparent rings and floating artwork.
  const artGeo=new THREE.TorusKnotGeometry(1.38,.14,96,8,2,3);
  const sculpture=new THREE.Mesh(artGeo,mat('cyan'));
  sculpture.position.set(x,CITY_BASE+4.25,z);
  sculpture.userData.ownedGeometry=true;
  group.add(sculpture);
}
export function makeHaloExchange(b:Building,lod:number):THREE.Group{
  const group=new THREE.Group();
  group.name='HALO EXCHANGE · FURNISHED';
  if(lod===2){
    // Keep the original skyline silhouette at long distance without
    // transmitting the detailed room fittings.
    const pedestal=new THREE.Mesh(box,mat('blacksteel'));
    pedestal.position.set(b.x,CITY_BASE+5.1,b.z);
    pedestal.scale.set(b.w*.92,10.2,b.d*.92);
    group.add(pedestal);
    const tower=new THREE.Mesh(cylinder,mat('glass'));
    tower.position.set(b.x,CITY_BASE+19.8,b.z);
    tower.scale.set(13.8,12,13.8);
    group.add(tower);
    const crown=new THREE.Mesh(cylinder,mat('bronze'));
    crown.position.set(b.x,CITY_BASE+25.5,b.z);
    crown.scale.set(14.65,.8,14.65);
    group.add(crown);
    return group;
  }
  for(const part of haloInterior(b))addMesh(group,part,lod);
  decorativeElements(group,b,lod);
  return group;
}
