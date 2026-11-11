type RapierModule = typeof import('@dimforge/rapier3d-compat').default;
let RAPIER: RapierModule;
import type { ClientInput } from './protocol.js';
import { BUILDINGS, sceneryForChunk } from './city.js';
import { PORT_SHAPES } from './harbor.js';
import { CITY_PROPS } from './city-furniture.js';
import { CHUNK_SIZE, CITY_BASE, SEA_LEVEL, clampWorld, isCity, terrainHeight, wrapAngle } from './world.js';

export const EYE_HEIGHT=1.7;
export const PLAYER_RADIUS=.34;
export interface MotionState { x:number; y:number; z:number; vy:number; grounded:boolean; jumpHeld:boolean; }
type Collider=import('@dimforge/rapier3d-compat').Collider;
interface Actor { collider:Collider; }
const physicsGravity=17.5;
export function groundHeight(x:number,z:number):number {
  return isCity(x,z) ? CITY_BASE+.18 : Math.max(terrainHeight(x,z),SEA_LEVEL-1.35);
}

/** Physically simulated, shared between the authoritative server and client prediction. */
export class PhysicsRuntime {
  readonly world:import('@dimforge/rapier3d-compat').World;
  private controller:import('@dimforge/rapier3d-compat').KinematicCharacterController;
  private actors=new Map<string,Actor>();
  private scenery=new Map<string,Collider[]>();
  private lastScenerySignature='';
  private constructor(){
    this.world=new RAPIER.World({x:0,y:-physicsGravity,z:0});
    this.controller=this.world.createCharacterController(.015);
    this.controller.setSlideEnabled(true);
    this.controller.setMaxSlopeClimbAngle(.85);
    this.controller.enableAutostep(.32,.12,false);
    this.controller.enableSnapToGround(.3);
    for(const b of BUILDINGS){
      this.addBox(b.x,CITY_BASE+b.h/2,b.z,b.w,b.h,b.d);
    }
    for(const p of PORT_SHAPES){
      if(p.solid)this.addBox(p.x,p.y,p.z,p.w,p.h,p.d);
    }
    for(const p of CITY_PROPS){
      if(p.solid)this.addBox(p.x,p.y,p.z,p.w,p.h,p.d);
    }
    this.world.step();
  }
  static async create():Promise<PhysicsRuntime>{
    if(!RAPIER){
      RAPIER=(await import('@dimforge/rapier3d-compat')).default;
      await RAPIER.init();
    }
    return new PhysicsRuntime();
  }
  private addBox(x:number,y:number,z:number,w:number,h:number,d:number):Collider {
    return this.world.createCollider(RAPIER.ColliderDesc.cuboid(w/2,h/2,d/2).setTranslation(x,y,z));
  }
  /** Keep spatial vegetation colliders bounded to active clients' nearby world tiles. */
  updateScenery(positions:ReadonlyArray<{x:number;z:number}>):void {
    const needed=new Set<string>();
    for(const p of positions){
      const cx=Math.round(p.x/CHUNK_SIZE),cz=Math.round(p.z/CHUNK_SIZE);
      for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)
        needed.add((cx+dx)+','+(cz+dz));
    }
    const signature=[...needed].sort().join('|');
    if(signature===this.lastScenerySignature)return;
    this.lastScenerySignature=signature;
    for(const [id,colliders] of this.scenery){
      if(needed.has(id))continue;
      for(const collider of colliders)this.world.removeCollider(collider,false);
      this.scenery.delete(id);
    }
    for(const id of needed){
      if(this.scenery.has(id))continue;
      const [cx,cz]=id.split(',').map(Number);
      const objects=sceneryForChunk(cx,cz);
      const colliders:Collider[]=[];
      for(const t of objects.trees){
        const size=.29*t.scale;
        colliders.push(this.world.createCollider(
          RAPIER.ColliderDesc.cylinder(2.0*t.scale,size)
            .setTranslation(t.x,t.y+2*t.scale,t.z)));
      }
      for(const r of objects.rocks){
        colliders.push(this.world.createCollider(
          RAPIER.ColliderDesc.cuboid(r.scale*.83,r.scale*.55,r.scale*.78)
            .setTranslation(r.x,r.y+r.scale*.46,r.z)));
      }
      this.scenery.set(id,colliders);
    }
    this.world.step();
  }
  private ensureActor(id:string,state:MotionState):Actor {
    const existing=this.actors.get(id);
    if(existing)return existing;
    // Parentless capsule colliders use world-space translations directly.
    // This is supported by Rapier's kinematic controller and avoids stale
    // rigid-body query transforms during high-frequency client prediction.
    const collider=this.world.createCollider(RAPIER.ColliderDesc.capsule(.55,PLAYER_RADIUS)
      .setTranslation(state.x,state.y-EYE_HEIGHT+.93,state.z));
    const actor={collider};
    this.actors.set(id,actor);
    return actor;
  }
  removeActor(id:string):void {
    const actor=this.actors.get(id);
    if(!actor)return;
    this.world.removeCollider(actor.collider,false);
    this.actors.delete(id);
  }
  /** Kinematic capsule sweep resolves sideways sliding and prevents tunneling. */
  move(id:string,s:MotionState,m:ClientInput,dt:number):void {
    const actor=this.ensureActor(id,s);
    const yaw=wrapAngle(m.yaw),mag=Math.max(1,Math.hypot(m.forward,m.strafe));
    const speed=m.sprint?9.5:5.4,step=Math.min(dt,.05);
    const dx=(-Math.sin(yaw)*m.forward+Math.cos(yaw)*m.strafe)*speed*step/mag;
    const dz=(-Math.cos(yaw)*m.forward-Math.sin(yaw)*m.strafe)*speed*step/mag;
    const foot=s.y-EYE_HEIGHT;
    const origin={x:s.x,y:foot+.93,z:s.z};
    actor.collider.setTranslation(origin);
    // Rapier's continuous swept capsule takes precedence over all static obstacle shapes.
    this.controller.computeColliderMovement(actor.collider,{x:dx,y:0,z:dz});
    const sweep=this.controller.computedMovement();
    const tx=clampWorld(s.x+sweep.x),tz=clampWorld(s.z+sweep.z);
    // Terrain height is pre-baked, and the same immutable elevation function is authoritative.
    const prev=groundHeight(s.x,s.z),next=groundHeight(tx,tz);
    const grade=next-prev;
    const horizontal=Math.hypot(sweep.x,sweep.z);
    if(!s.grounded || grade<=.17+horizontal*.95){
      s.x=tx;s.z=tz;
    }
    if(m.jump&&!s.jumpHeld&&s.grounded){s.vy=6.4;s.grounded=false;}
    s.jumpHeld=m.jump;
    s.vy-=physicsGravity*step;
    s.y+=s.vy*step;
    const ground=groundHeight(s.x,s.z)+EYE_HEIGHT;
    if(s.y<=ground){s.y=ground;s.vy=0;s.grounded=true;}
    actor.collider.setTranslation({x:s.x,y:s.y-EYE_HEIGHT+.93,z:s.z});
  }
  collidersCount():number {
    return this.world.colliders.len();
  }
  free():void {
    this.world.free();
  }
}
