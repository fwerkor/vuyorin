type RapierModule = typeof import('@dimforge/rapier3d-compat').default;
let RAPIER: RapierModule;
import type { ClientInput } from './protocol.js';
import { BUILDINGS, sceneryForChunk } from './city.js';
import { PORT_SHAPES } from './harbor.js';
import { CITY_PROPS } from './city-furniture.js';
import { landmarkSolids, landmarkFor, CITY_BRIDGES } from './landmarks.js';
import { haloInterior, haloSupportHeight, HALO_LEVELS, haloLiftNearby, haloNextFloor, haloFloorIndex, HALO_LIFT, isHalo } from './halo.js';
import { CHUNK_SIZE, CITY_BASE, SEA_LEVEL, clampWorld, isCity, terrainHeight, wrapAngle } from './world.js';

export const EYE_HEIGHT=1.7;
export const PLAYER_RADIUS=.34;
const CAPSULE_MIDDLE=1.0;
const CAPSULE_HALF_HEIGHT=.59;
export interface LiftTravel { from:number; to:number; elapsed:number; duration:number }
export interface MotionState {
  x:number; y:number; z:number; vy:number; grounded:boolean;
  jumpHeld:boolean; interactHeld?:boolean; lift?:LiftTravel|null;
}
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
  private remoteActorIds=new Set<string>();
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
      if(isHalo(b)){
        for(const part of haloInterior(b)){
          if(!part.solid)continue;
          const shape=part.kind==='cylinder'
            ?RAPIER.ColliderDesc.cylinder(part.h/2,part.w/2)
            :part.kind==='sphere'
              ?RAPIER.ColliderDesc.ball(part.w/2)
              :RAPIER.ColliderDesc.cuboid(part.w/2,part.h/2,part.d/2);
          shape.setTranslation(part.x,part.y,part.z);
          if(part.yaw)shape.setRotation({
            x:0,y:Math.sin(part.yaw/2),z:0,w:Math.cos(part.yaw/2)
          });
          this.world.createCollider(shape);
        }
      } else if(landmarkFor(b)){
        for(const shape of landmarkSolids(b)){
          if(shape.kind==='box'){
            const collider=RAPIER.ColliderDesc.cuboid(shape.w/2,shape.h/2,shape.d/2)
              .setTranslation(shape.x,shape.y,shape.z);
            if(shape.rotation)collider.setRotation({
              x:0,y:Math.sin(shape.rotation/2),z:0,w:Math.cos(shape.rotation/2)
            });
            this.world.createCollider(collider);
          }else{
            this.world.createCollider(
              RAPIER.ColliderDesc.cylinder(shape.h/2,shape.w/2)
                .setTranslation(shape.x,shape.y,shape.z));
          }
        }
      } else this.addBox(b.x,CITY_BASE+b.h/2,b.z,b.w,b.h,b.d);
    }
    for(const bridge of CITY_BRIDGES){
      this.addBox(bridge.x,bridge.y,bridge.z,bridge.w,bridge.h,bridge.d);
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
    const collider=this.world.createCollider(RAPIER.ColliderDesc.capsule(CAPSULE_HALF_HEIGHT,PLAYER_RADIUS)
      .setTranslation(state.x,state.y-EYE_HEIGHT+CAPSULE_MIDDLE,state.z));
    const actor={collider};
    this.actors.set(id,actor);
    return actor;
  }
  /** Keep a live remote avatar's solid capsule in the same Rapier query world. */
  setActorPosition(id:string,s:Pick<MotionState,'x'|'y'|'z'>):void {
    const collider=this.ensureActor(id,{...s,vy:0,grounded:true,jumpHeld:false}).collider;
    collider.setTranslation({x:s.x,y:s.y-EYE_HEIGHT+CAPSULE_MIDDLE,z:s.z});
  }
  /** The browser predicts against *other* players, never its own local capsule. */
  syncRemoteActors(players:ReadonlyArray<{id:string;x:number;y:number;z:number}>):void {
    const seen=new Set<string>();
    for(const p of players){
      const id='remote:'+p.id;
      seen.add(id);
      this.setActorPosition(id,p);
    }
    for(const id of this.remoteActorIds)if(!seen.has(id))this.removeActor(id);
    this.remoteActorIds=seen;
    // Rapier's spatial query pipeline must incorporate the moved colliders.
    this.world.step();
  }
  /** Use the same capsule and collider queries for safe, non-overlapping spawns. */
  canOccupy(x:number,y:number,z:number):boolean {
    this.world.step();
    let blocked=false;
    this.world.intersectionsWithShape(
      {x,y:y-EYE_HEIGHT+CAPSULE_MIDDLE,z},{x:0,y:0,z:0,w:1},
      new RAPIER.Capsule(CAPSULE_HALF_HEIGHT,PLAYER_RADIUS+.045),
      () => {blocked=true;return false;}
    );
    return !blocked;
  }
  removeActor(id:string):void {
    const actor=this.actors.get(id);
    if(!actor)return;
    this.world.removeCollider(actor.collider,false);
    this.actors.delete(id);
    this.remoteActorIds.delete(id);
  }
  /** Continuous horizontal sweeps, shared authored indoor levels, and lift travel. */
  move(id:string,s:MotionState,m:ClientInput,dt:number):void {
    const actor=this.ensureActor(id,s);
    const step=Math.min(Math.max(dt,0),.05);
    if(s.lift){
      // Deterministic travel on server/client; movement is locked inside cab.
      const lift=s.lift;
      lift.elapsed=Math.min(lift.elapsed+step,lift.duration);
      const t=lift.elapsed/lift.duration;
      const ease=t*t*(3-2*t);
      s.x=HALO_LIFT.x;s.z=HALO_LIFT.z;
      s.y=lift.from+(lift.to-lift.from)*ease+EYE_HEIGHT;
      s.vy=0;s.grounded=t>=1;
      s.interactHeld=!!m.interact;s.jumpHeld=m.jump;
      if(t>=1)s.lift=null;
      actor.collider.setTranslation({x:s.x,y:s.y-EYE_HEIGHT+CAPSULE_MIDDLE,z:s.z});
      return;
    }
    const yaw=wrapAngle(m.yaw),mag=Math.max(1,Math.hypot(m.forward,m.strafe));
    const speed=m.sprint?9.5:5.4;
    const dx=(-Math.sin(yaw)*m.forward+Math.cos(yaw)*m.strafe)*speed*step/mag;
    const dz=(-Math.cos(yaw)*m.forward-Math.sin(yaw)*m.strafe)*speed*step/mag;
    const foot=s.y-EYE_HEIGHT;
    actor.collider.setTranslation({x:s.x,y:foot+CAPSULE_MIDDLE,z:s.z});
    // A zero input must not cause Rapier's penetration recovery to drift
    // the character after keyup. Preserve upstream idle-movement fix.
    if(m.forward!==0 || m.strafe!==0){
      this.controller.computeColliderMovement(actor.collider,{x:dx,y:0,z:dz});
      const sweep=this.controller.computedMovement();
      const tx=clampWorld(s.x+sweep.x),tz=clampWorld(s.z+sweep.z);
      const prev=groundHeight(s.x,s.z),next=groundHeight(tx,tz);
      const grade=next-prev,horizontal=Math.hypot(sweep.x,sweep.z);
      if(!s.grounded || grade<=.17+horizontal*.95){
        s.x=tx;s.z=tz;
      }
    }
    // The shared world, never untrusted player coordinates, authorizes lift
    // activation. Only an edge-triggered key press near the lift is accepted.
    if(m.interact && !s.interactHeld && haloLiftNearby(s.x,s.z,foot) && s.grounded){
      const from=HALO_LEVELS[haloFloorIndex(foot)];
      const to=HALO_LEVELS[haloNextFloor(foot)];
      s.lift={from,to,elapsed:0,duration:Math.max(1.5,Math.abs(to-from)/4.5)};
      s.x=HALO_LIFT.x;s.z=HALO_LIFT.z;
      s.y=from+EYE_HEIGHT;s.vy=0;s.grounded=false;
      s.interactHeld=true;s.jumpHeld=m.jump;
      actor.collider.setTranslation({x:s.x,y:s.y-EYE_HEIGHT+CAPSULE_MIDDLE,z:s.z});
      return;
    }
    s.interactHeld=!!m.interact;
    if(m.jump&&!s.jumpHeld&&s.grounded){s.vy=6.4;s.grounded=false;}
    s.jumpHeld=m.jump;
    const previousFeet=s.y-EYE_HEIGHT;
    const authored=haloSupportHeight(s.x,s.z,previousFeet);
    const floor=Math.max(groundHeight(s.x,s.z),authored??-Infinity);
    if(s.grounded&&previousFeet>floor+.32)s.grounded=false;
    s.vy-=physicsGravity*step;
    s.y+=s.vy*step;
    if(s.y<=floor+EYE_HEIGHT){
      s.y=floor+EYE_HEIGHT;s.vy=0;s.grounded=true;
    }
    actor.collider.setTranslation({x:s.x,y:s.y-EYE_HEIGHT+CAPSULE_MIDDLE,z:s.z});
  }
  collidersCount():number {
    return this.world.colliders.len();
  }
  free():void {
    this.world.free();
  }
}
