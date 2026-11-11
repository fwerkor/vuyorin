import type { ClientInput } from './protocol.js';
import { clampWorld, SEA_LEVEL, terrainHeight, wrapAngle, isCity, CITY_BASE } from './world.js';
import { nearbyObstacles, sceneryForChunk } from './city.js';
import { CHUNK_SIZE } from './world.js';

export const EYE_HEIGHT = 1.7;
export const PLAYER_RADIUS = 0.39;
export interface MotionState {
  x: number; y: number; z: number; vy: number; grounded: boolean; jumpHeld: boolean;
}
export function groundHeight(x: number, z: number): number {
  // Shallow water can be waded through. Deeper-water swimming is a separate system.
  return isCity(x,z) ? CITY_BASE + .125 : Math.max(terrainHeight(x,z), SEA_LEVEL - 1.35);
}
export function blockedAt(x: number, z: number, feetY: number): boolean {
  if (nearbyObstacles(x,z,2).some(o =>
      feetY < o.maxY && feetY + 1.9 > o.minY &&
      Math.abs(x - o.x) < o.w/2 + PLAYER_RADIUS &&
      Math.abs(z - o.z) < o.d/2 + PLAYER_RADIUS)) return true;
  const cx = Math.round(x / CHUNK_SIZE), cz = Math.round(z / CHUNK_SIZE);
  for(let iz=cz-1;iz<=cz+1;iz++) for(let ix=cx-1;ix<=cx+1;ix++) {
    const {trees,rocks}=sceneryForChunk(ix,iz);
    for(const t of trees) {
      const dx=x-t.x,dz=z-t.z, r=.28*t.scale+PLAYER_RADIUS;
      if(dx*dx+dz*dz<r*r && feetY<t.y+5*t.scale && feetY+1.9>t.y)return true;
    }
    for(const rock of rocks) {
      const dx=x-rock.x,dz=z-rock.z,r=rock.scale*.72+PLAYER_RADIUS;
      if(dx*dx+dz*dz<r*r && feetY<rock.y+rock.scale*1.3 && feetY+1.9>rock.y)return true;
    }
  }
  return false;
}
export function advanceMotion(s: MotionState, m: ClientInput, dt: number): void {
  const yaw = wrapAngle(m.yaw), f = m.forward, a = m.strafe;
  const mag = Math.max(1,Math.hypot(f,a)), speed=m.sprint?9.5:5.4;
  const dx = (-Math.sin(yaw)*f+Math.cos(yaw)*a)*speed*dt/mag;
  const dz = (-Math.cos(yaw)*f-Math.sin(yaw)*a)*speed*dt/mag;
  const feet = s.y - EYE_HEIGHT;
  const currentGround=groundHeight(s.x,s.z);
  function canMove(nx:number,nz:number,travel:number):boolean {
    if (blockedAt(nx,nz,feet)) return false;
    const climb=groundHeight(nx,nz)-currentGround;
    return !s.grounded || climb <= .15+travel*.84;
  }
  const nx=clampWorld(s.x+dx);
  if (canMove(nx,s.z,Math.abs(dx))) s.x=nx;
  const nz=clampWorld(s.z+dz);
  if (canMove(s.x,nz,Math.abs(dz))) s.z=nz;
  if (m.jump && !s.jumpHeld && s.grounded){s.vy=6.4;s.grounded=false;}
  s.jumpHeld=m.jump;
  s.vy -= 17.5*dt;
  s.y += s.vy*dt;
  const floor=groundHeight(s.x,s.z)+EYE_HEIGHT;
  if (s.y<=floor) {s.y=floor;s.vy=0;s.grounded=true;}
}
