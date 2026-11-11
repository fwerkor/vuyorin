import * as THREE from 'three';
import { CHUNK_SIZE } from '../shared/world';
import { withinWorld, type TerrainRequest } from './terrain-data';
import { decodeTile, type LoadedChunk } from './terrain-binary';
import { makeCityChunk } from './city';
import { makeScenery } from './scenery';

const rings=[2,5,9];
const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.87,metalness:.025,side:THREE.FrontSide});
interface Tile { group:THREE.Group; geometry:THREE.BufferGeometry; lod:number }
export class WorldStreamer {
  private tiles=new Map<string,Tile>();
  private wanted=new Map<string,TerrainRequest>();
  private pending=new Map<string,TerrainRequest>();
  private worker:Worker | null=null;
  private dirty=true;
  private centerX=Infinity;
  private centerZ=Infinity;
  private lastRefresh=0;
  private frame=0;
  private failed=new Map<string,number>();

  constructor(private scene:THREE.Scene){
    if(typeof Worker!=='undefined'){
      this.worker=new Worker(new URL('./terrain.worker.ts',import.meta.url),{type:'module'});
      this.worker.onmessage=(event:MessageEvent<LoadedChunk|{key:string;error:string}>)=>{
        if('error' in event.data){
          this.pending.delete(event.data.key);
          this.failed.set(event.data.key,performance.now());
          console.warn('World chunk not available',event.data.key,event.data.error);
        } else this.accept(event.data);
      };
      this.worker.onerror=(e)=>{console.error('Terrain worker error',e.message);this.worker?.terminate();this.worker=null;this.pending.clear();};
    }
  }
  stats(){return {loaded:this.tiles.size,waiting:this.pending.size,target:this.wanted.size};}
  private needs(x:number,z:number){
    const cx=Math.round(x/CHUNK_SIZE),cz=Math.round(z/CHUNK_SIZE);
    if(cx===this.centerX&&cz===this.centerZ&&!this.dirty)return;
    this.centerX=cx;this.centerZ=cz;this.dirty=false;
    this.wanted.clear();
    for(let dz=-rings[2];dz<=rings[2];dz++)for(let dx=-rings[2];dx<=rings[2];dx++){
      const dist=Math.hypot(dx,dz);
      if(dist>rings[2]||!withinWorld(cx+dx,cz+dz))continue;
      const lod=dist<=rings[0]?0:dist<=rings[1]?1:2;
      const px=cx+dx,pz=cz+dz,key=px+','+pz;
      this.wanted.set(key,{key,cx:px,cz:pz,lod});
    }
    for(const [key,tile] of this.tiles){
      if(this.wanted.has(key))continue;
      this.scene.remove(tile.group);
      tile.group.traverse(node=>{
        if(node instanceof THREE.InstancedMesh)node.dispose();
        if(node instanceof THREE.Mesh && node.userData.ownedGeometry)node.geometry.dispose();
        if(node instanceof THREE.Mesh && node.userData.ownedMaterial){
          const mat=node.material as THREE.MeshBasicMaterial;
          mat.map?.dispose();mat.dispose();
        }
      });
      tile.geometry.dispose();
      this.tiles.delete(key);
    }
  }
  private accept(result:LoadedChunk){
    const pending=this.pending.get(result.key);
    this.pending.delete(result.key);
    const wanted=this.wanted.get(result.key);
    if(!pending||!wanted||pending.lod!==result.lod||wanted.lod!==result.lod)return;
    const existing=this.tiles.get(result.key);
    if(existing&&existing.lod===result.lod)return;
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(result.positions,3));
    geometry.setAttribute('color',new THREE.BufferAttribute(result.colors,3));
    geometry.setIndex(new THREE.BufferAttribute(result.indices,1));
    geometry.computeVertexNormals();
    const terrain=new THREE.Mesh(geometry,material);
    terrain.position.set(result.cx*CHUNK_SIZE,0,result.cz*CHUNK_SIZE);
    terrain.receiveShadow=true;
    const group=new THREE.Group();
    group.add(terrain);
    if(result.lod!==2){
      group.add(makeScenery(result.trees,result.rocks,result.lod));
    }
    group.add(makeCityChunk(result.cx,result.cz,result.lod));
    if(existing){
      this.scene.remove(existing.group);
      existing.group.traverse(node=>{
        if(node instanceof THREE.InstancedMesh)node.dispose();
        if(node instanceof THREE.Mesh && node.userData.ownedGeometry)node.geometry.dispose();
        if(node instanceof THREE.Mesh && node.userData.ownedMaterial){
          const mat=node.material as THREE.MeshBasicMaterial;
          mat.map?.dispose();mat.dispose();
        }
      });
      existing.geometry.dispose();
    }
    this.scene.add(group);
    this.tiles.set(result.key,{group,geometry,lod:result.lod});
  }
  update(x:number,z:number,time:number) {
    this.frame++;
    this.needs(x,z);
    if(time-this.lastRefresh<60)return;
    this.lastRefresh=time;
    const cx=this.centerX,cz=this.centerZ;
    const tasks=[...this.wanted.values()].filter(r=>{
      const old=this.tiles.get(r.key);
      return (!old||old.lod!==r.lod)&&!this.pending.has(r.key) &&
        (!this.failed.has(r.key)||time-this.failed.get(r.key)!>15000);
    });
    tasks.sort((a,b)=>{
      const da=Math.hypot(a.cx-cx,a.cz-cz),db=Math.hypot(b.cx-cx,b.cz-cz);
      return da-db;
    });
    const room=Math.max(0,3-this.pending.size);
    for(const task of tasks.slice(0,room)){
      this.pending.set(task.key,task);
      if(this.worker) this.worker.postMessage(task);
      else fetch(`/world/v1/${task.cx}_${task.cz}.bin`)
        .then(r=>{if(!r.ok)throw new Error('map asset '+r.status);return r.arrayBuffer();})
        .then(bytes=>this.accept(decodeTile(bytes,task)))
        .catch(e=>{this.pending.delete(task.key);this.failed.set(task.key,performance.now());console.warn(e);});
    }
  }
}
