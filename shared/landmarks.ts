/**
 * VUYORIN waterfront signature district.
 *
 * Each parcel has a deliberately authored identity. The solid architectural
 * masses are the source of truth for both Rapier colliders and Three.js meshes.
 * Neon decals, rooftop aerials and suspended trim are visual-only ornaments.
 */
import { CITY_BASE, CHUNK_SIZE } from './world.js';
import type { Building } from './city.js';

export type LandmarkForm =
  | 'helix' | 'arcology' | 'suspended' | 'portal' | 'garden'
  | 'observatory' | 'spire' | 'crescent' | 'transit'
  | 'cantilever' | 'datavault' | 'foundry';
export interface LandmarkSpec {
  id: string;
  form: LandmarkForm;
  name: string;
  accent: 'cyan'|'amber'|'magenta'|'lime';
}
export const LANDMARKS: readonly LandmarkSpec[] = [
  {id:'0:-5',form:'helix',name:'AURORA / 09',accent:'cyan'},
  {id:'2:-4',form:'arcology',name:'TWIN ARCOLOGY',accent:'magenta'},
  {id:'2:-5',form:'cantilever',name:'SKY SHELF',accent:'amber'},
  {id:'1:-4',form:'portal',name:'VELOCITY HUB',accent:'cyan'},
  {id:'-3:-4',form:'foundry',name:'THE FOUNDRY',accent:'amber'},
  {id:'-2:-5',form:'datavault',name:'DATA VAULT 07',accent:'magenta'},
  {id:'-1:-2',form:'spire',name:'NEXUS OBSIDIAN',accent:'cyan'},
  {id:'-2:-4',form:'garden',name:'VERTICAL WILD',accent:'lime'},
  {id:'-2:-3',form:'suspended',name:'THE BREACH',accent:'magenta'},
  {id:'0:-3',form:'observatory',name:'HALO EXCHANGE',accent:'cyan'},
  {id:'1:-3',form:'transit',name:'NEON TERMINAL',accent:'amber'},
  {id:'1:-2',form:'crescent',name:'LUNAR HOTEL',accent:'magenta'},
  {id:'2:-3',form:'spire',name:'BEACON 17',accent:'amber'},
  {id:'2:-2',form:'suspended',name:'VANTA MARKET',accent:'magenta'},
  {id:'-3:-5',form:'foundry',name:'DRYDOCK POWER',accent:'amber'},
  {id:'-3:-2',form:'transit',name:'QUAY PLAZA',accent:'cyan'},
  {id:'-1:-3',form:'garden',name:'NIGHT GARDENS',accent:'lime'},
  {id:'-2:-2',form:'observatory',name:'VESPER DOME',accent:'cyan'},
];
const byId = new Map(LANDMARKS.map(x=>[x.id,x]));
export function landmarkFor(b: Building): LandmarkSpec | undefined {return byId.get(b.id);}
export type SolidKind = 'box'|'round'|'hex';
export interface ArchitecturalSolid {
  kind:SolidKind;
  x:number;y:number;z:number;
  w:number;h:number;d:number;
  rotation:number;
  finish:'glass'|'metal'|'stone'|'copper';
}
export function landmarkSolids(b:Building):ArchitecturalSolid[] {
  const spec=landmarkFor(b);
  if(!spec)return [];
  const out:ArchitecturalSolid[]=[];
  const w=b.w,d=b.d,h=b.h,x=b.x,z=b.z,base=CITY_BASE;
  function box(xf:number,zf:number,wf:number,df:number,y0:number,height:number,
    finish:ArchitecturalSolid['finish'],rotation=0){
    if(height<.15)return;
    out.push({kind:'box',x:x+xf*w,z:z+zf*d,w:w*wf,d:d*df,
      y:base+y0+height/2,h:height,finish,rotation});
  }
  function round(xf:number,zf:number,radius:number,y0:number,height:number,
    finish:ArchitecturalSolid['finish'],kind:'round'|'hex'='round'){
    if(height<.15)return;
    out.push({kind,x:x+xf*w,z:z+zf*d,w:radius*2,d:radius*2,
      y:base+y0+height/2,h:height,rotation:0,finish});
  }
  // Podiums are deliberately broad and closed on the ground floor. There are
  // no visually open entrances that the collision system would contradict.
  const podium=Math.min(7,h*.31);
  box(0,0,.93,.93,0,podium,'stone');
  const remain=h-podium;
  switch(spec.form){
    case 'helix':
      round(0,0,Math.min(w,d)*.36,podium,remain*.62,'glass','hex');
      round(.055,-.025,Math.min(w,d)*.24,podium+remain*.62,remain*.38,'glass','hex');
      break;
    case 'arcology':
      box(-.255,0,.38,.65,podium,remain*.96,'glass');
      box(.255,0,.38,.65,podium,remain*.80,'glass');
      box(0,0,.78,.36,podium+remain*.63,remain*.10,'metal');
      break;
    case 'suspended':
      box(-.19,0,.48,.66,podium,remain*.62,'glass');
      box(.18,.03,.45,.69,podium+remain*.40,remain*.48,'metal');
      box(0,0,.66,.42,podium+remain*.67,remain*.13,'glass');
      break;
    case 'portal':
      box(-.26,0,.30,.71,podium,remain*.9,'metal');
      box(.26,0,.30,.71,podium,remain*.9,'glass');
      box(0,0,.84,.36,podium+remain*.67,remain*.18,'glass');
      break;
    case 'garden':
      for(let i=0;i<4;i++)
        box(i%2===0?-.095:.095,0,.79-i*.095,.78-i*.07,
          podium+remain*i/4,remain/4,'stone');
      break;
    case 'observatory':
      round(0,0,Math.min(w,d)*.42,podium,remain*.43,'glass');
      round(0,0,Math.min(w,d)*.35,podium+remain*.43,remain*.30,'metal','hex');
      round(0,0,Math.min(w,d)*.39,podium+remain*.73,remain*.27,'glass');
      break;
    case 'spire':
      box(0,0,.69,.67,podium,remain*.66,'glass');
      round(0,0,Math.min(w,d)*.23,podium+remain*.52,remain*.48,'glass','hex');
      break;
    case 'crescent':
      round(-.13,0,Math.min(w,d)*.31,podium,remain*.75,'glass');
      round(.23,0,Math.min(w,d)*.2,podium+remain*.18,remain*.82,'glass');
      box(0,0,.73,.45,podium+remain*.53,remain*.14,'metal');
      break;
    case 'transit':
      box(0,0,.83,.72,podium,remain*.26,'glass');
      box(-.18,0,.42,.65,podium+remain*.20,remain*.54,'metal');
      box(.16,0,.41,.59,podium+remain*.25,remain*.75,'glass');
      break;
    case 'cantilever':
      for(let i=0;i<4;i++)box((i%2?.14:-.14),0,.69-i*.035,.68-i*.02,
        podium+remain*i/4,remain/4,'glass');
      break;
    case 'datavault':
      round(0,0,Math.min(w,d)*.36,podium,remain*.82,'stone','hex');
      round(0,0,Math.min(w,d)*.26,podium+remain*.75,remain*.25,'glass','hex');
      break;
    case 'foundry':
      box(0,0,.78,.71,podium,remain*.62,'stone');
      box(-.27,.24,.16,.14,podium,remain*.93,'metal');
      box(.27,.24,.16,.14,podium,remain*.78,'metal');
      box(0,0,.67,.49,podium+remain*.59,remain*.18,'copper');
      break;
  }
  return out;
}
export interface CityBridge {
  id:string;x:number;z:number;y:number;w:number;h:number;d:number;
}
export const CITY_BRIDGES: readonly CityBridge[] = [
  {id:'halo-gardens',x:0,z:-140,y:CITY_BASE+16.3,w:19.5,h:2.7,d:5.0},
  {id:'north-arcology',x:112,z:-196,y:CITY_BASE+34.0,w:14.5,h:2.7,d:5.0}
];
export function bridgesForChunk(cx:number,cz:number):CityBridge[] {
  return CITY_BRIDGES.filter(p=>Math.round(p.x/CHUNK_SIZE)===cx&&
    Math.round(p.z/CHUNK_SIZE)===cz);
}
