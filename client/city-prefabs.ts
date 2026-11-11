import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Building } from '../shared/city';

type Variant='b_small'|'b_medium'|'b_large';
const loader=new GLTFLoader();
const models=new Map<Variant,Promise<THREE.Group>>();
const bounds=new Map<Variant,THREE.Box3>();
const colors=['#6c7778','#657480','#8f8074'];
const fallbackGeom=new THREE.BoxGeometry(1,1,1);
const fallbackMat=colors.map(c=>new THREE.MeshStandardMaterial({color:c,metalness:.14,roughness:.85}));
/** Choose a few existing CC0 buildings without replacing the authored city or collider layout. */
export function cityPrefabVariant(building:Building,lod:number):Variant|null {
  if(lod!==0||Math.abs(building.x)>240||building.z< -480||building.z> -80)return null;
  if(building.seed<.37)return null;
  if(building.h<25)return 'b_small';
  if(building.h<48)return 'b_medium';
  return 'b_large';
}
function template(name:Variant):Promise<THREE.Group>{
  let result=models.get(name);
  if(result)return result;
  result=loader.loadAsync('/assets/cc0/'+name+'.glb').then(gltf=>{
    const root=gltf.scene;
    root.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(root);
    if(box.isEmpty())throw new Error('Invalid GLB geometry '+name);
    bounds.set(name,box);
    root.traverse(obj=>{if(obj instanceof THREE.Mesh){
      obj.castShadow=true;obj.receiveShadow=true;
    }});
    return root;
  });
  models.set(name,result);
  return result;
}
export function attachCityPrefab(group:THREE.Group,b:Building,name:Variant):void{
  // Temporary low-detail silhouette preserves the streetscape while fetching.
  const shell=new THREE.Mesh(fallbackGeom,fallbackMat[name==='b_small'?0:name==='b_medium'?1:2]);
  shell.position.set(b.x,3.4+b.h/2,b.z);
  shell.scale.set(b.w,b.h,b.d);
  shell.castShadow=true;shell.receiveShadow=true;
  group.add(shell);
  void template(name).then(root=>{
    // The parent tile may have been evicted before this fetch completed.
    if(!group.parent)return;
    const object=root.clone(true);
    const box=bounds.get(name)!;
    const size=new THREE.Vector3();box.getSize(size);
    const min=box.min,center=new THREE.Vector3();box.getCenter(center);
    // Visible geometry fits exactly into the corresponding authoritative AABB.
    object.scale.set(b.w/size.x,b.h/size.y,b.d/size.z);
    object.position.set(b.x-center.x*object.scale.x,
      3.4-min.y*object.scale.y,b.z-center.z*object.scale.z);
    group.remove(shell);
    group.add(object);
  }).catch(error=>console.warn('CC0 prefab unavailable; keeping fallback silhouette',name,error));
}
