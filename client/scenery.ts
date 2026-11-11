import * as THREE from 'three';
import type { ScenicTree, ScenicRock } from '../shared/city';
const pine = new THREE.ConeGeometry(2.3,7.7,7);
const stem = new THREE.CylinderGeometry(.3,.42,4,7);
const broad = new THREE.IcosahedronGeometry(3.2,1);
const rockGeo = new THREE.DodecahedronGeometry(1,0);
const barkMat=new THREE.MeshStandardMaterial({color:'#463f35',roughness:.98});
const leafMat=new THREE.MeshStandardMaterial({color:'#315941',roughness:.96,flatShading:true});
const broadMat=new THREE.MeshStandardMaterial({color:'#496d43',roughness:.99,flatShading:true});
const stoneMat=new THREE.MeshStandardMaterial({color:'#67716b',roughness:.94,flatShading:true});
export function makeScenery(treesAll: ScenicTree[], rocksAll: ScenicRock[], lod:number):THREE.Group{
  const group=new THREE.Group();
  if(lod===2)return group;
  const rate=lod===0?1:3;
  const trees=treesAll.filter((_,i)=>i%rate===0);
  const rocks=rocksAll.filter((_,i)=>i%rate===0);
  const conifers=trees.filter(t=>t.kind===0), broadleaves=trees.filter(t=>t.kind===1);
  const dummy=new THREE.Object3D();
  function addTrees(arr:typeof trees,canopy:THREE.BufferGeometry,mat:THREE.Material){
    if(!arr.length)return;
    const crowns=new THREE.InstancedMesh(canopy,mat,arr.length);
    const trunks=new THREE.InstancedMesh(stem,barkMat,arr.length);
    for(let i=0;i<arr.length;i++){
      const t=arr[i];
      dummy.rotation.set(0,t.kind===0?.8:0,0);
      dummy.position.set(t.x,t.y+5.5*t.scale,t.z);
      dummy.scale.setScalar(t.scale);dummy.updateMatrix();crowns.setMatrixAt(i,dummy.matrix);
      dummy.position.set(t.x,t.y+2*t.scale,t.z);
      dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);
    }
    crowns.castShadow=lod===0;crowns.receiveShadow=true;trunks.castShadow=lod===0;
    crowns.computeBoundingSphere();trunks.computeBoundingSphere();
    group.add(crowns,trunks);
  }
  addTrees(conifers,pine,leafMat);addTrees(broadleaves,broad,broadMat);
  if(rocks.length){
    const mesh=new THREE.InstancedMesh(rockGeo,stoneMat,rocks.length);
    for(let i=0;i<rocks.length;i++){
      const r=rocks[i];dummy.position.set(r.x,r.y+.45*r.scale,r.z);
      dummy.rotation.set(r.spin*.2,r.spin,r.spin*.15);
      dummy.scale.set(r.scale*1.3,r.scale*.8,r.scale*1.1);
      dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
    }
    mesh.castShadow=lod===0;mesh.receiveShadow=true;mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return group;
}
