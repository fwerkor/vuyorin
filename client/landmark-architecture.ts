import * as THREE from 'three';
import type { Building } from '../shared/city';
import {
  bridgesForChunk, landmarkFor, landmarkSolids,
  type ArchitecturalSolid, type LandmarkSpec
} from '../shared/landmarks';
import { CITY_BASE, hash2 } from '../shared/world';

const cube=new THREE.BoxGeometry(1,1,1);
const roundGeometry=new THREE.CylinderGeometry(1,1,1,20,1);
const hexGeometry=new THREE.CylinderGeometry(1,1,1,6,1);
const shrubGeometry=new THREE.IcosahedronGeometry(1,1);
const textureLoader=new THREE.TextureLoader();
const materialCache=new Map<string,THREE.Material>();

function facadeGeometry(shape:ArchitecturalSolid):THREE.BufferGeometry{
  // UV scale is in metres, not parcel count: 90-m towers have actual
  // storey-sized windows rather than one giant stretched facade texture.
  const geometry=(shape.kind==='box'?cube:
    shape.kind==='hex'?hexGeometry:roundGeometry).clone();
  const uv=geometry.getAttribute('uv');
  if(shape.kind==='box'){
    const faces:[[number,number],[number,number],[number,number],[number,number],[number,number],[number,number]]=[
      [shape.d,shape.h],[shape.d,shape.h],
      [shape.w,shape.d],[shape.w,shape.d],
      [shape.w,shape.h],[shape.w,shape.h]
    ];
    for(let side=0;side<6;side++){
      const [metersU,metersV]=faces[side];
      for(let vertex=0;vertex<4;vertex++){
        const i=side*4+vertex;
        uv.setXY(i,uv.getX(i)*metersU/48,uv.getY(i)*metersV/42);
      }
    }
  }else{
    const count=uv.count;
    const circumference=Math.PI*shape.w;
    for(let i=0;i<count;i++){
      uv.setXY(i,uv.getX(i)*circumference/48,
        uv.getY(i)*shape.h/42);
    }
  }
  uv.needsUpdate=true;
  return geometry;
}
function loadTexture(name:string,srgb:boolean):THREE.Texture{
  const result=textureLoader.load('/assets/architecture/'+name+'.png');
  if(srgb)result.colorSpace=THREE.SRGBColorSpace;
  result.anisotropy=4;
  result.wrapS=THREE.RepeatWrapping;
  result.wrapT=THREE.RepeatWrapping;
  return result;
}
function material(kind:'glass'|'metal'|'stone'|'copper', spec:LandmarkSpec):THREE.Material {
  const key=kind+':'+spec.accent;
  const cached=materialCache.get(key);
  if(cached)return cached;
  let result:THREE.MeshStandardMaterial;
  if(kind==='glass'){
    const palette=spec.accent==='lime'?'cyan':spec.accent;
    result=new THREE.MeshStandardMaterial({
      map:loadTexture(palette+'_albedo',true),
      emissiveMap:loadTexture(palette+'_emissive',false),
      emissive:spec.accent==='magenta'?'#e6a5dd':'#ffe4c9',
      emissiveIntensity:.66,roughness:.27,metalness:.57
    });
  }else{
    const file=kind==='metal'?'titanium':kind==='copper'?'oxidized':'basalt';
    result=new THREE.MeshStandardMaterial({
      map:loadTexture(file+'_albedo',true),
      roughness:kind==='stone'?.81:.48,metalness:kind==='stone'?.11:.62
    });
  }
  materialCache.set(key,result);
  return result;
}
type DetailMaterial='strut'|'shadow'|'foliage'|'cyan'|'magenta'|'amber'|'lime';
const detailMaterials: Record<DetailMaterial,THREE.MeshStandardMaterial>={
  strut:new THREE.MeshStandardMaterial({color:'#71868c',roughness:.42,metalness:.72}),
  shadow:new THREE.MeshStandardMaterial({color:'#152933',roughness:.35,metalness:.62}),
  foliage:new THREE.MeshStandardMaterial({color:'#4b7058',roughness:.96}),
  cyan:new THREE.MeshStandardMaterial({color:'#5fe8ff',emissive:'#18d7fa',emissiveIntensity:2.2,metalness:.18,roughness:.31}),
  magenta:new THREE.MeshStandardMaterial({color:'#ff72cd',emissive:'#ff36bb',emissiveIntensity:2,metalness:.22,roughness:.31}),
  amber:new THREE.MeshStandardMaterial({color:'#ffcb88',emissive:'#ff9e30',emissiveIntensity:2.4,metalness:.2,roughness:.36}),
  lime:new THREE.MeshStandardMaterial({color:'#a9ff9b',emissive:'#36b95a',emissiveIntensity:1.4,roughness:.75})
};
interface BoxMark {x:number;y:number;z:number;w:number;h:number;d:number;ry?:number}
class InstanceBatch {
  private collections=new Map<DetailMaterial,BoxMark[]>();
  add(key:DetailMaterial,x:number,y:number,z:number,w:number,h:number,d:number,ry=0) {
    let list=this.collections.get(key);
    if(!list){list=[];this.collections.set(key,list);}
    list.push({x,y,z,w,h,d,ry});
  }
  build(parent:THREE.Group){
    const dummy=new THREE.Object3D();
    for(const [key,list] of this.collections){
      if(!list.length)continue;
      const mesh=new THREE.InstancedMesh(cube,detailMaterials[key],list.length);
      mesh.castShadow=key==='strut'||key==='shadow';
      mesh.receiveShadow=true;
      list.forEach((p,i)=>{
        dummy.position.set(p.x,p.y,p.z);
        dummy.rotation.set(0,p.ry||0,0);
        dummy.scale.set(p.w,p.h,p.d);
        dummy.updateMatrix();
        mesh.setMatrixAt(i,dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate=true;
      mesh.computeBoundingSphere();
      parent.add(mesh);
    }
  }
}
function own(parent:THREE.Group,mesh:THREE.Mesh):THREE.Mesh {
  mesh.userData.ownedGeometry=true;
  parent.add(mesh);
  return mesh;
}
function boxStripes(batch:InstanceBatch,solid:ArchitecturalSolid,accent:DetailMaterial,lod:number) {
  if(solid.kind!=='box'||solid.h<5)return;
  const {x,y,z,w,d,h}=solid;
  const y0=y-h/2,top=y+h/2;
  const inset=.23;
  for(const side of [-1,1]){
    for(const sx of [-1,1]){
      batch.add('strut',x+sx*(w/2-inset),y,z+side*(d/2-inset),.27,h,.32);
    }
    if(lod===0)batch.add(accent,x+side*(w/2-.7),y,z+side*(d/2-.31),.20,h-.8,.16);
  }
  const spacing=lod===0?4.8:lod===1?9.6:18;
  const count=Math.floor(h/spacing);
  for(let floor=1;floor<=count;floor++){
    const yi=y0+floor*spacing;
    if(yi>top-.6)break;
    batch.add('strut',x,yi,z+d/2+.03,w,.16,.18);
    batch.add('strut',x,yi,z-d/2-.03,w,.16,.18);
    if(floor%3===0){
      batch.add(accent,x,yi+.16,z+d/2+.14,w-.6,.12,.12);
    }
  }
  if(lod===0 && h>10){
    const cols=Math.max(2,Math.floor((w-2)/4.7));
    for(let i=0;i<cols;i++){
      const xi=x-w/2+1.8+i*(w-3.6)/cols;
      batch.add('shadow',xi,y0+2.4,z+d/2+.035,.24,3,.16);
      if(i%2===0)batch.add(accent,xi,y0+4.1,z+d/2+.22,2,.12,.12);
    }
  }
}
function cylinderRings(parent:THREE.Group,solid:ArchitecturalSolid,accent:DetailMaterial,lod:number) {
  const rings=lod===0?Math.max(2,Math.ceil(solid.h/12)):1;
  const radius=solid.w/2+.17;
  for(let j=0;j<=rings;j++){
    const y=solid.y-solid.h/2+solid.h*j/Math.max(1,rings);
    const geo=new THREE.TorusGeometry(radius,.15,6,solid.kind==='hex'?6:28);
    const ring=own(parent,new THREE.Mesh(geo,j%2===0?detailMaterials[accent]:detailMaterials.strut));
    ring.position.set(solid.x,y,solid.z);
    ring.rotation.x=Math.PI/2;
    if(solid.kind==='hex')ring.rotation.z=Math.PI/6;
  }
}
function brace(group:THREE.Group,from:THREE.Vector3,to:THREE.Vector3,thickness:number,mat:THREE.Material){
  const direction=new THREE.Vector3().subVectors(to,from);
  const mesh=new THREE.Mesh(cube,mat);
  mesh.position.copy(from).add(to).multiplyScalar(.5);
  mesh.scale.set(thickness,direction.length(),thickness);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());
  mesh.castShadow=true;mesh.receiveShadow=true;
  group.add(mesh);
}
function addTube(group:THREE.Group,points:THREE.Vector3[],radius:number,mat:THREE.Material){
  const geo=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),Math.max(10,points.length*3),radius,6,false);
  const mesh=own(group,new THREE.Mesh(geo,mat));
  mesh.castShadow=false;mesh.receiveShadow=false;
}
function twist(group:THREE.Group,b:Building,accent:DetailMaterial,lod:number){
  if(lod===2)return;
  const towers=lod===0?3:1;
  const radius=Math.min(b.w,b.d)*.365;
  for(let lane=0;lane<towers;lane++){
    const points:THREE.Vector3[]=[];
    const steps=22;
    for(let i=0;i<=steps;i++){
      const t=i/steps,phase=t*Math.PI*3.5+(lane/towers)*2*Math.PI;
      points.push(new THREE.Vector3(
        b.x+Math.cos(phase)*radius,CITY_BASE+7+t*(b.h-7),
        b.z+Math.sin(phase)*radius
      ));
      points[points.length-1].y=CITY_BASE+7+t*(b.h-7);
    }
    addTube(group,points,.18,lane===0?detailMaterials[accent]:detailMaterials.strut);
  }
}
function addSign(group:THREE.Group,text:string,accent:DetailMaterial,x:number,y:number,z:number,w:number,front=true){
  const canvas=document.createElement('canvas');
  canvas.width=1024;canvas.height=220;
  const ctx=canvas.getContext('2d');
  if(!ctx)return;
  const rgb:Record<DetailMaterial,string>={
    cyan:'#65eaff',magenta:'#ff6bd0',amber:'#ffbd62',lime:'#b5ff9e',
    strut:'#9fb7bb',shadow:'#63737d',foliage:'#a6da9c'
  };
  ctx.fillStyle='#08121ad9';ctx.fillRect(0,0,1024,220);
  ctx.strokeStyle=rgb[accent];ctx.lineWidth=10;ctx.strokeRect(7,7,1010,206);
  ctx.fillStyle=rgb[accent];
  ctx.shadowColor=rgb[accent];ctx.shadowBlur=20;
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.font='bold 94px Arial, sans-serif';
  ctx.fillText(text,512,111,930);
  const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;
  const geo=new THREE.PlaneGeometry(w,2.8);
  const mat=new THREE.MeshBasicMaterial({map:tex,transparent:true,side:THREE.DoubleSide,depthWrite:false});
  const sign=own(group,new THREE.Mesh(geo,mat));
  sign.userData.ownedMaterial=true;
  sign.position.set(x,y,z);
  if(!front)sign.rotation.y=Math.PI;
}
function finishDetails(group:THREE.Group,b:Building,spec:LandmarkSpec,lod:number,batch:InstanceBatch) {
  const accent=spec.accent;
  const top=CITY_BASE+b.h;
  const minDim=Math.min(b.w,b.d);
  if(lod<=1){
    // Roof mechanical decks, communication arrays and lit skyline markers.
    batch.add('shadow',b.x,top+.55,b.z,Math.min(8,b.w*.22),1.1,Math.min(6,b.d*.18));
    if(b.h>32){
      batch.add('strut',b.x,top+3.2,b.z,.4,6.4,.4);
      batch.add(accent,b.x,top+6.6,b.z,.38,.6,.38);
    }
    for(const side of [-1,1]){
      batch.add('strut',b.x+side*b.w*.26,CITY_BASE+3.8,b.z+b.d*.40,
        .55,7.6,.5);
      batch.add(accent,b.x+side*b.w*.26,CITY_BASE+7.9,b.z+b.d*.40,
        .55,.32,.55);
    }
  }
  if(spec.form==='helix')twist(group,b,accent,lod);
  if(spec.form==='observatory'||spec.form==='crescent'){
    // Observatory toroidal crowns give a striking silhouette from the harbor.
    const radius=minDim*(spec.form==='observatory'?.41:.34);
    for(let i=0;i<(lod===2?1:3);i++){
      const ring=own(group,new THREE.Mesh(
        new THREE.TorusGeometry(radius+(i===1?1.2:0),.32,8,40),
        i===1?detailMaterials.strut:detailMaterials[accent]));
      ring.rotation.x=Math.PI/2;
      ring.position.set(b.x,top-1-i*3.2,b.z);
    }
  }
  if(spec.form==='portal'||spec.form==='transit'||spec.form==='suspended'){
    if(lod<2){
      const curve:THREE.Vector3[]=[];
      for(let i=0;i<=13;i++){
        const t=i/13;
        curve.push(new THREE.Vector3(b.x+(t-.5)*b.w*.76,
          CITY_BASE+b.h*(.75+.17*Math.sin(t*Math.PI)),
          b.z+b.d*.27));
      }
      addTube(group,curve,.38,detailMaterials[accent]);
    }
  }
  if(spec.form==='garden'){
    if(lod===0){
      // Hanging planting over each stepped terrace. Planters are intentionally
      // set back behind the authored physical building envelope.
      const foliage=detailMaterials.foliage;
      for(let tier=0;tier<4;tier++){
        const y=CITY_BASE+Math.min(7,b.h*.31)+(b.h-Math.min(7,b.h*.31))*(tier+1)/4;
        const radius=b.w*(.36-tier*.040);
        for(let i=0;i<12;i++){
          const a=i*Math.PI/6;
          const shrub=own(group,new THREE.Mesh(shrubGeometry,foliage));
          shrub.position.set(b.x+Math.cos(a)*radius,y+.6,b.z+Math.sin(a)*radius*.85);
          shrub.scale.set(1.1+hash2(i,tier)*.7,1.0,1.4);
          shrub.userData.ownedGeometry=false;
          shrub.castShadow=true;
        }
      }
    }
  }
  if(spec.form==='foundry'||spec.form==='datavault'){
    if(lod===0){
      for(let i=0;i<3;i++){
        const r=1.2+i*.38;
        const geo=new THREE.CylinderGeometry(r,r,b.h*.36,12);
        const pipe=own(group,new THREE.Mesh(geo,detailMaterials.strut));
        pipe.position.set(b.x+(i-1)*b.w*.17,CITY_BASE+b.h*.64,
          b.z-b.d*.24);
        pipe.castShadow=true;
      }
    }
  }
  if(spec.form==='arcology'||spec.form==='cantilever'||spec.form==='suspended'){
    if(lod===0){
      const y0=CITY_BASE+Math.min(7,b.h*.31),topY=CITY_BASE+b.h*.83;
      for(const side of [-1,1]){
        const z=b.z+side*b.d*.37;
        const lhs=new THREE.Vector3(b.x-b.w*.32,y0,z);
        const rhs=new THREE.Vector3(b.x+b.w*.32,topY,z);
        brace(group,lhs,rhs,.65,detailMaterials.strut);
        brace(group,new THREE.Vector3(b.x+b.w*.32,y0,z),
          new THREE.Vector3(b.x-b.w*.32,topY,z),.45,detailMaterials[accent]);
      }
    }
    if(lod<2){
      for(let i=0;i<4;i++){
        const y=CITY_BASE+b.h*(.30+i*.15);
        batch.add(accent,b.x,y,b.z+b.d*.37,b.w*.58,.18,.24);
        batch.add('strut',b.x,y+.19,b.z+b.d*.37,b.w*.6,.19,.24);
      }
    }
  }
  if(lod===0){
    // Vertical color accents and a grounded, readable district identity.
    const posZ=b.z+b.d*.465+.13;
    addSign(group,spec.name,accent,b.x,CITY_BASE+4.0,posZ,
      Math.min(22,b.w*.74));
  }
}
export function makeLandmark(b:Building,lod:number):THREE.Group{
  const spec=landmarkFor(b);
  if(!spec)throw new Error('Unknown landmark parcel '+b.id);
  const group=new THREE.Group();
  group.name='landmark:'+spec.name;
  const batch=new InstanceBatch();
  for(const solid of landmarkSolids(b)){
    const geo=facadeGeometry(solid);
    const mesh=new THREE.Mesh(geo,material(solid.finish,spec));
    mesh.userData.ownedGeometry=true;
    mesh.position.set(solid.x,solid.y,solid.z);
    mesh.rotation.y=solid.rotation;
    mesh.scale.set(solid.kind==='box'?solid.w:solid.w/2,solid.h,
      solid.kind==='box'?solid.d:solid.d/2);
    mesh.castShadow=lod===0;
    mesh.receiveShadow=true;
    group.add(mesh);
    if(solid.kind==='box')boxStripes(batch,solid,spec.accent,lod);
    else if(lod<2)cylinderRings(group,solid,spec.accent,lod);
  }
  finishDetails(group,b,spec,lod,batch);
  batch.build(group);
  return group;
}
export function makeSkybridges(cx:number,cz:number,lod:number):THREE.Group{
  const group=new THREE.Group();
  const batch=new InstanceBatch();
  for(const bridge of bridgesForChunk(cx,cz)){
    const {x,z,y,w,h,d}=bridge;
    batch.add('shadow',x,y,z,w,h,d);
    batch.add('strut',x,y+h/2+.18,z,w,.25,d);
    for(const side of [-1,1]){
      batch.add('cyan',x,y,z+side*(d/2+.05),w-.5,.13,.14);
      batch.add('strut',x,y+h/2+1.3,z+side*(d/2-.2),w,.28,.18);
      if(lod===0){
        for(let i=0;i<8;i++){
          batch.add('shadow',x-w/2+(i+.5)*w/8,y+.9,z+side*d/2,
            .18,1.8,.12);
        }
      }
    }
  }
  batch.build(group);
  return group;
}
