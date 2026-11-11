import * as THREE from 'three';
import { BODY_STYLES, HEAD_STYLES, PACK_STYLES, type Appearance } from '../shared/appearance';

/** Procedural, tileable cloth maps; built once per avatar and freed when out of range. */
function clothMap(base:string,trim:string,pattern:number):THREE.CanvasTexture {
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;
  const ctx=canvas.getContext('2d')!;
  ctx.fillStyle=base;ctx.fillRect(0,0,256,256);
  ctx.globalAlpha=.14;
  for(let i=0;i<256;i+=4){
    ctx.fillStyle=i%8===0?'#ffffff':'#111722';
    ctx.fillRect(i,0,1,256);ctx.fillRect(0,i,256,1);
  }
  ctx.globalAlpha=1;
  const shader=ctx.createLinearGradient(0,0,256,256);
  shader.addColorStop(0,'#ffffff12');shader.addColorStop(.45,'#00000000');shader.addColorStop(1,'#00000046');
  ctx.fillStyle=shader;ctx.fillRect(0,0,256,256);
  ctx.strokeStyle=trim;ctx.lineWidth=5;ctx.globalAlpha=.85;
  if(pattern===0){
    ctx.strokeRect(27,32,202,176);
    ctx.beginPath();ctx.moveTo(128,0);ctx.lineTo(128,256);ctx.stroke();
    ctx.fillStyle=trim;ctx.fillRect(160,74,35,13);ctx.fillRect(160,94,55,4);
  }else if(pattern===1){
    for(let i=-256;i<512;i+=64){
      ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i+180,256);ctx.stroke();
    }
    ctx.strokeRect(35,48,185,158);
  }else{
    ctx.strokeRect(24,29,208,199);
    for(let y=55;y<215;y+=38){ctx.fillStyle=trim;ctx.fillRect(37,y,52,5);ctx.fillRect(174,y,36,5);}
  }
  ctx.globalAlpha=.7;ctx.setLineDash([3,8]);ctx.strokeStyle='#f9dfb3';ctx.lineWidth=1.3;
  ctx.strokeRect(15,15,226,226);ctx.setLineDash([]);ctx.globalAlpha=1;
  const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;
  tex.wrapS=THREE.RepeatWrapping;tex.wrapT=THREE.RepeatWrapping;
  tex.anisotropy=4;return tex;
}

function faceMap(head:Appearance['head']):THREE.CanvasTexture {
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=216;
  const ctx=canvas.getContext('2d')!;
  const dark=head==='sentinel'?'#172532':head==='wanderer'?'#493647':'#4c3c2f';
  const skin=head==='sentinel'?'#b5c3c7':head==='wanderer'?'#ddb49f':'#e6ba91';
  ctx.fillStyle=dark;ctx.beginPath();ctx.roundRect(13,9,230,194,43);ctx.fill();
  ctx.fillStyle=skin;ctx.beginPath();ctx.roundRect(37,23,182,166,43);ctx.fill();
  const glow=ctx.createLinearGradient(0,20,256,204);
  glow.addColorStop(0,'#fff4e026');glow.addColorStop(1,'#02030c48');
  ctx.fillStyle=glow;ctx.beginPath();ctx.roundRect(37,23,182,166,43);ctx.fill();
  ctx.strokeStyle=head==='sentinel'?'#a1e8f1':'#352729';ctx.lineWidth=7;ctx.lineCap='round';
  for(const [x,dir] of [[68,-1],[159,1]] as const){
    ctx.beginPath();ctx.moveTo(x,80);ctx.quadraticCurveTo(x+25,70+dir*3,x+42,80);ctx.stroke();
    ctx.fillStyle='#172333';ctx.beginPath();ctx.ellipse(x+21,102,11,13,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#ffffff';ctx.beginPath();ctx.arc(x+17,98,4,0,Math.PI*2);ctx.fill();
  }
  ctx.strokeStyle='#885b52';ctx.lineWidth=4;
  ctx.beginPath();ctx.moveTo(128,116);ctx.lineTo(120,139);ctx.lineTo(133,142);ctx.stroke();
  ctx.strokeStyle='#624340';ctx.lineWidth=5;ctx.beginPath();
  ctx.moveTo(103,158);ctx.quadraticCurveTo(126,170,150,156);ctx.stroke();
  ctx.strokeStyle='#ffffff66';ctx.lineWidth=3;ctx.beginPath();ctx.roundRect(18,13,219,188,38);ctx.stroke();
  const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;return tex;
}
const physical=(map:THREE.Texture,metalness=.18)=>new THREE.MeshStandardMaterial({map,roughness:.67,metalness});
const solid=(color:string,metalness=.15,emissive='#000000')=>
  new THREE.MeshStandardMaterial({color,roughness:.5,metalness,emissive,emissiveIntensity:.3});
function part(parent:THREE.Group,geometry:THREE.BufferGeometry,material:THREE.Material,
  xyz:[number,number,number],scale?:[number,number,number]):THREE.Mesh{
  const mesh=new THREE.Mesh(geometry,material);mesh.position.set(...xyz);
  if(scale)mesh.scale.set(...scale);
  mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}

/** 1.9m figure, with eye details at 1.7m to match the first-person camera. */
export function createAvatar(look:Appearance):THREE.Group {
  const group=new THREE.Group();
  const helmet=HEAD_STYLES[look.head],suit=BODY_STYLES[look.body],bag=PACK_STYLES[look.backpack];
  const cloth=physical(clothMap(suit.color,suit.trim,look.body==='frontier'?0:look.body==='neon'?1:2));
  const canvasBag=physical(clothMap(bag.color,bag.trim,look.backpack==='expedition'?2:0),.2);
  const trim=solid(suit.trim,.55),dark=solid('#202936',.28),stitch=solid('#aeb9b1',.64);
  const shell=solid(helmet.trim,.28),visor=solid(helmet.color,.62,helmet.color);
  // Preserve the original round-headed capsule silhouette; add tailoring and joints.
  part(group,new THREE.CapsuleGeometry(.36,.47,8,16),cloth,[0,1.11,0]);
  part(group,new THREE.SphereGeometry(.305,16,12),cloth,[0,.76,0]);
  for(const side of [-1,1]){
    const arm=part(group,new THREE.CapsuleGeometry(.125,.4,5,10),cloth,[side*.435,1.14,0]);
    arm.rotation.z=side*.17;
    part(group,new THREE.SphereGeometry(.14,10,8),trim,[side*.39,1.43,0]);
    part(group,new THREE.SphereGeometry(.122,10,8),dark,[side*.49,.83,-.018]);
    part(group,new THREE.CapsuleGeometry(.15,.39,5,10),cloth,[side*.18,.41,0]);
    part(group,new THREE.BoxGeometry(.31,.2,.47),dark,[side*.18,.12,-.09]);
    part(group,new THREE.BoxGeometry(.075,.58,.06),trim,[side*.24,1.15,-.35]);
    part(group,new THREE.BoxGeometry(.085,.12,.06),stitch,[side*.24,.95,-.395]);
  }
  part(group,new THREE.BoxGeometry(.28,.16,.035),dark,[0,1.24,-.37]);
  part(group,new THREE.BoxGeometry(.22,.035,.04),trim,[0,1.24,-.395]);
  part(group,new THREE.CylinderGeometry(.31,.29,.115,12),dark,[0,.81,0]);
  part(group,new THREE.BoxGeometry(.17,.09,.09),trim,[0,.82,-.28]);
  // Head shell, transparent-looking visor frame, and readable human face.
  part(group,new THREE.SphereGeometry(.29,24,16),visor,[0,1.65,0]);
  part(group,new THREE.SphereGeometry(.306,24,16,0,Math.PI*2,0,.35),shell,[0,1.71,0]);
  const face=part(group,new THREE.PlaneGeometry(.455,.378),
    new THREE.MeshStandardMaterial({map:faceMap(look.head),transparent:true,roughness:.33,metalness:.06,side:THREE.DoubleSide}),
    [0,1.665,-.312]);
  face.castShadow=false;
  if(look.head==='sentinel'){
    part(group,new THREE.BoxGeometry(.62,.12,.25),shell,[0,1.79,-.18]);
    for(const side of [-1,1])part(group,new THREE.BoxGeometry(.12,.32,.26),trim,[side*.31,1.62,0]);
  }else if(look.head==='wanderer'){
    part(group,new THREE.TorusGeometry(.31,.07,8,24,Math.PI*1.25),shell,[0,1.65,-.11]).rotation.z=-Math.PI*.63;
    part(group,new THREE.ConeGeometry(.3,.18,12),shell,[0,1.94,.07]);
  }else{
    part(group,new THREE.BoxGeometry(.56,.07,.13),shell,[0,1.82,-.24]);
    for(const side of [-1,1])part(group,new THREE.SphereGeometry(.075,8,6),trim,[side*.31,1.68,0]);
  }
  // Backpack sits on the back (+Z), with webbing, zipper, pockets and lights.
  const packDepth=look.backpack==='expedition'?.43:.32;
  const packHeight=look.backpack==='expedition'?.84:.65;
  const packWidth=look.backpack==='reactor'?.59:.70;
  part(group,new THREE.BoxGeometry(packWidth,packHeight,packDepth),canvasBag,[0,1.14,.46]);
  part(group,new THREE.BoxGeometry(packWidth-.16,.21,packDepth+.025),dark,[0,1.14-packHeight*.32,.47]);
  part(group,new THREE.BoxGeometry(packWidth-.09,.045,packDepth+.03),trim,[0,1.14+packHeight*.3,.47]);
  for(const side of [-1,1]){
    part(group,new THREE.BoxGeometry(.1,.61,.07),dark,[side*.27,1.22,.27]);
    part(group,new THREE.BoxGeometry(.09,.1,.055),stitch,[side*.27,1.12,.226]);
  }
  if(look.backpack==='reactor'){
    const light=solid(bag.trim,.4,bag.trim);
    part(group,new THREE.BoxGeometry(.34,.23,.038),light,[0,1.14,.46+packDepth*.54]);
    part(group,new THREE.BoxGeometry(.19,.04,.04),dark,[0,1.14,.46+packDepth*.62]);
  }else if(look.backpack==='expedition'){
    part(group,new THREE.CylinderGeometry(.14,.14,.48,12),canvasBag,[.38,1.2,.46]);
    part(group,new THREE.CylinderGeometry(.14,.14,.48,12),canvasBag,[-.38,1.2,.46]);
  }
  return group;
}

export function disposeAvatar(mesh:THREE.Group):void {
  mesh.traverse(object=>{
    if(object instanceof THREE.Mesh){
      const materials=Array.isArray(object.material)?object.material:[object.material];
      object.geometry.dispose();
      for(const material of materials){
        if('map' in material && material.map instanceof THREE.Texture)material.map.dispose();
        material.dispose();
      }
    }
    if(object instanceof THREE.Sprite){
      object.material.map?.dispose();object.material.dispose();
    }
  });
}
