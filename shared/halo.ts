/**
 * HALO EXCHANGE — first complete VUYORIN destination.
 *
 * Versioned original architectural plan. All solid geometry is rendered from
 * this file AND registered as static Rapier colliders on the server/client.
 * Positions use world metres; no random generation or client-only shortcuts.
 */
import { CITY_BASE } from './world.js';
import type { Building } from './city.js';

export const HALO_PARCEL='0:-3';
export const HALO_LEVELS=[CITY_BASE+.18,CITY_BASE+7.20,CITY_BASE+16.20] as const;
export const HALO_LIFT={x:38,z:-147,radius:2.15} as const;
export type HaloFinish =
  | 'blacksteel'|'bronze'|'marble'|'timber'|'terrazzo'|'glass'
  | 'frosted'|'cream'|'cyan'|'amber'|'plant'|'fabric'|'screen';
export type HaloKind='box'|'cylinder'|'sphere';
export interface HaloPart {
  id:string;kind:HaloKind;finish:HaloFinish;
  x:number;y:number;z:number;w:number;h:number;d:number;
  yaw:number;solid:boolean;detail:0|1|2;
}
export function isHalo(b:Building):boolean {return b.id===HALO_PARCEL;}
/** Coarse floor level for zone labels and elevator semantics. */
export function haloFloorIndex(feetY:number):number {
  if(feetY>=HALO_LEVELS[2]-1.0)return 2;
  if(feetY>=HALO_LEVELS[1]-1.0)return 1;
  return 0;
}
export function haloLiftNearby(x:number,z:number,feetY:number):boolean {
  return Math.hypot(x-HALO_LIFT.x,z-HALO_LIFT.z)<=HALO_LIFT.radius &&
    feetY>=HALO_LEVELS[0]-1.0 && feetY<=HALO_LEVELS[2]+1;
}
export function haloNextFloor(feetY:number):number {
  return (haloFloorIndex(feetY)+1)%HALO_LEVELS.length;
}
/**
 * Select the highest surface not above the old character foot position.
 * A player on an upper floor stays supported, but falls if they walk through
 * the atrium opening. Do not use a global 2D heightfield for indoor floors.
 */
export function haloSupportHeight(x:number,z:number,previousFeetY:number):number | null {
  const X=x-28,Z=z+140;
  if(Math.abs(X)>20||Math.abs(Z)>20)return null;
  const nearEnough=(height:number)=>height<=previousFeetY+.28;
  const upper=Math.hypot(X,Z)<=13.75;
  if(upper && nearEnough(HALO_LEVELS[2]))return HALO_LEVELS[2];
  const ring=(Math.abs(X)<=17.3&&Math.abs(Z)<=17.3) &&
    (Math.abs(X)>=7.1||Math.abs(Z)>=6.7);
  if(ring&&nearEnough(HALO_LEVELS[1]))return HALO_LEVELS[1];
  return null;
}
export function haloInterior(b:Building):readonly HaloPart[] {
  if(!isHalo(b))return [];
  const parts:HaloPart[]=[];
  const x=b.x,z=b.z,base=CITY_BASE;
  function part(id:string,finish:HaloFinish,dx:number,y:number,dz:number,w:number,h:number,d:number,
    solid=true,detail:0|1|2=0,kind:HaloKind='box',yaw=0):void{
    if(w<=0||h<=0||d<=0)throw new Error('invalid HALO part dimensions '+id);
    parts.push({id,kind,finish,x:x+dx,y:base+y,z:z+dz,w,h,d,solid,detail,yaw});
  }
  const panel=(id:string,dx:number,yy:number,dz:number,w:number,h:number,d:number,yaw=0)=>
    part(id,'glass',dx,yy,dz,w,h,d,true,1,'box',yaw);
  // Structural shell: transparent perimeter walls with a *real* 8-m entrance.
  // No solid cuboid occupies the entire building footprint.
  part('foundation','terrazzo',0,.07,0,36.1,.14,36.1,false,2);
  panel('ground-west',-17.9,7.65,0,.20,14.65,35.8);
  panel('ground-east',17.9,7.65,0,.20,14.65,35.8);
  panel('ground-north',0,7.65,-17.9,35.8,14.65,.20);
  panel('ground-south-left',-11.05,3.75,17.9,13.70,6.8,.22);
  panel('ground-south-right',11.05,3.75,17.9,13.70,6.8,.22);
  panel('ground-south-upper',0,11.4,17.9,35.8,7.1,.20);
  part('entry-arch','blacksteel',0,7.15,17.9,9.0,.48,.72,true,0);
  for(const side of [-1,1]){
    part('door-mullion-'+side,'bronze',side*4.12,3.75,17.9,.30,7.1,.65,true,0);
    part('entry-canopy-arm-'+side,'blacksteel',side*3.8,7.55,19, .25,.35,3.0,true,0);
  }
  part('entry-canopy','bronze',0,7.85,19.2,11,.32,3.45,true,1);
  // Full-height glass mullions and horizontal transoms make the glazing read
  // as real construction instead of an invisible alpha wall. Existing glazing
  // owns collision; trims are deliberately visual only.
  for(const side of [-1,1]){
    for(let i=-3;i<=3;i++){
      const dz=i*4.4;
      part('side-mullion-'+side+'-'+i,'blacksteel',side*17.94,7.65,dz,.16,14.65,.24,false,1);
    }
    for(let i=-3;i<=3;i++){
      const dx=i*4.55;
      part('back-mullion-'+side+'-'+i,'bronze',dx,7.65,-17.96,.17,14.65,.18,false,1);
    }
    for(let i=1;i<=3;i++){
      const dx=side*(4.3+i*3.8);
      part('front-mullion-'+side+'-'+i,'blacksteel',dx,3.75,17.96,.16,6.8,.18,false,0);
    }
    part('side-transom-'+side,'bronze',side*17.97,7.1,0,.18,.16,35.0,false,1);
  }
  for(let height of [6.9,14.75])
    part('rear-transom-'+height,'bronze',0,height,-17.97,35,.14,.15,false,1);
  // Recessed luminous entry threshold and etched brass paving direction.
  part('entry-threshold','bronze',0,.205,17.28,7.8,.035,.16,false,0);
  for(let i=0;i<7;i++)
    part('entry-paving-'+i,'bronze',0,.209,15.9-i*2.0,1.8,.016,.065,false,0);

  // Double-height lobby, refined columns and breathable atrium.
  for(const sideX of [-1,1])for(const sideZ of [-1,1]){
    part('outer-column-'+sideX+'-'+sideZ,'bronze',sideX*16.5,7.2,sideZ*16.5,.75,14.4,.75,true,1);
  }
  for(const sx of [-1,1]){
    part('atrium-column-'+sx,'blacksteel',sx*8.2,7.4,-6.6,.56,14.8,.56,true,1);
  }
  // Mezzanine forms a continuous walkable *ring*, with a central atrium.
  // Top of slabs sits exactly at HALO_LEVELS[1].
  for(const side of [-1,1]){
    part('mezz-deck-x-'+side,'terrazzo',side*12.25,7.03,0,10.1,.34,34.6,true,1);
    part('atrium-rail-x-'+side,'bronze',side*7.15,7.87,0,.18,1.48,13.35,true,0);
    part('atrium-rail-z-'+side,'bronze',0,7.87,side*6.7,14.1,1.48,.18,true,0);
  }
  part('mezz-deck-front','terrazzo',0,7.03,12.0,14.4,.34,10.6,true,1);
  part('mezz-deck-rear','terrazzo',0,7.03,-12.0,14.4,.34,10.6,true,1);
  for(const side of [-1,1])for(let i=-6;i<=6;i+=2){
    part('atrium-rail-post-'+side+'-'+i,'blacksteel',side*7.15,8.04,i,.18,1.8,.18,true,0);
  }
  // Panoramic upper gallery. A genuine hollow ring of individually collidable
  // glass panes; the central space is not physically filled.
  part('observation-disk','terrazzo',0,16.02,0,28.5,.36,28.5,true,1,'cylinder');
  const panes=20;
  const radius=13.55;
  for(let i=0;i<panes;i++){
    const a=2*Math.PI*i/panes;
    const dx=Math.sin(a)*radius,dz=Math.cos(a)*radius;
    const yaw=a;
    panel('sky-window-'+i,dx,20.72,dz,4.35,8.90,.22,yaw);
    part('sky-mullion-'+i,'bronze',dx,20.72,dz,.14,8.90,.36,true,0,'box',yaw);
  }
  part('sky-roof','blacksteel',0,25.52,0,29.6,.80,29.6,true,1,'cylinder');
  part('sky-roof-cap','bronze',0,26.02,0,27.3,.14,27.3,true,1,'cylinder');
  for(let i=0;i<3;i++){
    part('sky-ring-'+i,'cyan',0,16.25+i*4.1,0,27.8,.18,27.8,false,1,'cylinder');
  }
  // Elevator: all three landings are clear; this is a public, doorless
  // panoramic lift with server-authorized floor transitions.
  const ex=HALO_LIFT.x-x,ez=HALO_LIFT.z-z;
  for(const sideX of [-1,1])for(const sideZ of [-1,1])
    part('lift-rail-'+sideX+'-'+sideZ,'bronze',ex+sideX*1.45,8.7,ez+sideZ*1.45,.13,16.6,.13,true,0);
  for(let floor=0;floor<3;floor++){
    const high=HALO_LEVELS[floor]-base;
    part('lift-pad-'+floor,'bronze',ex,high-.02,ez,2.75,.08,2.75,false,0);
    part('lift-strip-'+floor,'cyan',ex,high+.03,ez+1.4,2.68,.06,.12,false,0);
  }
  part('lift-sign','screen',ex,3.35,ez-1.6,3.3,1.15,.13,false,0);
  // Warm ceiling baffles and a generous illuminated soffit at the public foyer.
  for(let i=0;i<14;i++){
    const xx=-16.2+i*2.5;
    part('soffit-baffle-'+i,'timber',xx,6.81,13.7,.27,.40,6.3,false,0);
    if(i%2===0)
      part('soffit-light-'+i,'amber',xx,6.49,13.7,.06,.075,5.8,false,0);
  }
  for(const side of [-1,1]){
    part('floor-joint-eastwest-'+side,'bronze',side*11.3,.221,0,.038,.014,30,false,0);
    part('floor-joint-frontback-'+side,'bronze',0,.221,side*11.3,30,.014,.038,false,0);
    part('atrium-light-cove-'+side,'cyan',side*7.2,6.80,0,.10,.10,13.3,false,0);
  }
  // Reception / concierge station (left of the entry aisle).
  part('reception-counter','timber',-8.4, .82,8.0,7.6,1.35,1.35,true);
  part('reception-worktop','bronze',-8.4,1.57,8.0,8.0,.13,1.63,true);
  for(let i=0;i<3;i++){
    part('reception-terminal-'+i,'screen',-10.8+i*2.5,2.22,7.48,1.34,.85,.14,true);
    part('reception-lamp-'+i,'amber',-10.8+i*2.5,3.0,7.48,.16,.6,.16,false);
  }
  part('reception-back','blacksteel',-8.4,2.5,14.5,9.5,4.8,.42,true);
  part('reception-back-stripe','cyan',-8.4,3.1,14.2,8.8,.10,.13,false);
  // Coffee bar and a physically separated service bay at the rear west side.
  part('cafe-counter','timber',-11.7,.93,-7.2,8.0,1.58,1.12,true);
  part('cafe-bar-top','marble',-11.7,1.74,-7.2,8.4,.15,1.5,true);
  part('cafe-backwall','blacksteel',-16.4,2.50,-10.8,.56,4.7,11.9,true);
  for(let i=0;i<4;i++){
    part('cafe-stool-base-'+i,'bronze',-14.4+i*1.7,.55,-4.75,.65,1.05,.65,true,0,'cylinder');
    part('cafe-stool-seat-'+i,'fabric',-14.4+i*1.7,1.13,-4.75,.83,.18,.83,true,0,'cylinder');
  }
  part('cafe-espresso','blacksteel',-12.1,2.07,-8.15,1.8,.6,.75,true);
  part('cafe-espresso-lights','amber',-12.1,2.2,-7.77,1.4,.23,.1,false);
  for(let j=0;j<4;j++){
    part('cafe-pendant-'+j,'bronze',-14.4+j*1.75,4.55,-4.8,.14,2.8,.14,false);
    part('cafe-pendant-glow-'+j,'amber',-14.4+j*1.75,3.1,-4.8,.66,.48,.66,false,0,'sphere');
  }
  // Walkable conversation lounge, modular upholstered furniture.
  for(const [k,cx,cz,dir] of [
    ['west',-9,1.0,0],['east',7,8.0,Math.PI],
    ['north',0,-10.5,Math.PI/2]
  ] as const){
    part('lounge-sofa-'+k,'fabric',cx,.48,cz,3.8,.78,1.65,true,0,'box',dir);
    part('lounge-back-'+k,'fabric',cx,.96,cz-.66,3.8,.95,.35,true,0,'box',dir);
    part('lounge-table-'+k,'marble',cx,.65,cz+2.1,2.3,.10,1.35,true);
    part('lounge-table-leg-'+k,'blacksteel',cx,.33,cz+2.1,.38,.66,.38,true);
  }
  // Hall centerpiece: touchable pedestal with suspended non-colliding artwork.
  part('aurora-pedestal','marble',0,.56,0,3.15,1.0,3.15,true,0,'cylinder');
  part('aurora-plinth','bronze',0,1.12,0,2.85,.12,2.85,true,0,'cylinder');
  part('aurora-artcore','frosted',0,3.8,0,2.1,3.1,2.1,false,0,'sphere');
  for(let i=0;i<3;i++){
    part('aurora-orbit-'+i,'bronze',0,4.5+i*.45,0,4.3,.09,4.3,false,0,'cylinder');
  }
  // Planted islands with integrated lighting soften the large public atrium.
  for(const [i,px,pz] of [[0,-13,12],[1,12,12],[2,14,-10]] as const){
    part('lobby-planter-'+i,'marble',px,.50,pz,2.45,.80,2.45,true,0,'cylinder');
    part('lobby-greenery-'+i,'plant',px,1.62,pz,2.25,1.86,2.25,false,0,'sphere');
    part('planter-rim-'+i,'bronze',px,.92,pz,2.52,.12,2.52,false,0,'cylinder');
    part('planter-glow-'+i,'amber',px,.98,pz,2.1,.065,2.1,false,0,'cylinder');
  }
  // Wayfinding, exhibit plinths and digital gallery.
  for(const side of [-1,1]){
    part('gallery-base-'+side,'marble',side*5.1,.65,-12.2,2.6,1.12,2.6,true);
    part('gallery-glass-'+side,'frosted',side*5.1,2.02,-12.2,1.9,1.6,1.9,false,0,'cylinder');
    part('gallery-highlight-'+side,'cyan',side*5.1,2.9,-12.2,.23,.24,.23,false,0);
  }
  // Large-format route boards and wayfinding that can be walked around.
  part('wayfinding-kiosk-east','screen',12.8,2.15,6.0,1.65,2.95,.32,true);
  part('wayfinding-kiosk-west','screen',-13.2,2.15,2.6,1.65,2.95,.32,true);
  // Green wall, raised planter edges and columns in the mezzanine.
  for(const side of [-1,1]){
    part('mezz-planter-'+side,'timber',side*12.4,7.71,12.1,5.5,.93,1.35,true);
    for(let i=0;i<6;i++)part('mezz-leaf-'+side+'-'+i,'plant',side*12.4-2.3+i*.89,8.45,12.1,.72,1.08,.75,false,0,'sphere');
  }
  part('mezz-communal','timber',-12.2,8.05,-5.8,6.4,.38,2.25,true);
  for(let side of [-1,1])for(let i=0;i<3;i++){
    part('mezz-chair-'+side+'-'+i,'fabric',-14.4+i*2.1,7.68,-5.8+side*2.1,1.0,.94,1.0,true);
    part('mezz-back-'+side+'-'+i,'timber',-14.4+i*2.1,8.08,-5.8+side*2.55,1.0,.8,.15,true);
  }
  part('mezz-console','screen',13.8,8.6,7.2,2.2,1.8,.4,true);
  part('mezz-counter','bronze',13.8,7.63,7.2,3.0,.30,1.4,true);
  // Upper gallery / sky lounge: furnished panoramic destination, not a blank deck.
  part('sky-reception','timber',0,16.8,7.1,5.1,1.1,1.2,true);
  part('sky-reception-trim','bronze',0,17.4,7.1,5.4,.12,1.3,true);
  part('sky-projector','blacksteel',0,18.7,-1.2,2.65,1.2,2.65,true,0,'cylinder');
  part('sky-hologram','cyan',0,21.4,-1.2,1.6,3.3,1.6,false,0,'sphere');
  for(let i=0;i<8;i++){
    const a=2*Math.PI*(i+.25)/8;
    const rx=Math.sin(a)*8.55,rz=Math.cos(a)*8.55;
    const yaw=a;
    part('sky-sofa-'+i,'fabric',rx,16.60,rz,2.5,.74,1.3,true,0,'box',yaw);
    part('sky-sofa-back-'+i,'timber',rx,17.02,rz,.4,.72,.98,true,0,'box',yaw);
    part('sky-table-'+i,'marble',Math.sin(a)*10.8,16.73,Math.cos(a)*10.8,.9,.15,.9,true,0,'cylinder');
  }
  for(const [i,px,pz] of [[0,-5,5],[1,6,5],[2,-6,-6],[3,5,-6]] as const){
    part('sky-garden-'+i,'marble',px,16.72,pz,2.6,.9,2.6,true,0,'cylinder');
    part('sky-tree-'+i,'plant',px,18.35,pz,2.65,2.8,2.65,false,0,'sphere');
  }
  for(let i=0;i<12;i++){
    const a=i/12*2*Math.PI;
    part('sky-suspended-light-'+i,'amber',Math.sin(a)*9.7,24.55,Math.cos(a)*9.7,.78,.4,.78,false,0,'sphere');
  }
  return parts;
}
