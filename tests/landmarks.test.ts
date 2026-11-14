import assert from 'node:assert/strict';
import test from 'node:test';
import { BUILDINGS } from '../shared/city.js';
import { CITY_BASE } from '../shared/world.js';
import { LANDMARKS, CITY_BRIDGES, landmarkFor, landmarkSolids, bridgesForChunk } from '../shared/landmarks.js';
import { PhysicsRuntime, EYE_HEIGHT, groundHeight } from '../shared/physics.js';
import { isHalo } from '../shared/halo.js';

test('every landmark is a distinct named and authored parcel with multiple physical masses',()=>{
  assert.equal(LANDMARKS.length,18);
  assert.equal(new Set(LANDMARKS.map(s=>s.id)).size,18);
  assert.equal(new Set(LANDMARKS.map(s=>s.name)).size,18);
  assert.ok(new Set(LANDMARKS.map(s=>s.form)).size>=10);
  for(const spec of LANDMARKS){
    const b=BUILDINGS.find(building=>building.id===spec.id);
    assert.ok(b,'missing parcel '+spec.id);
    assert.equal(landmarkFor(b),spec);
    if(isHalo(b)){assert.deepEqual(landmarkSolids(b),[]);continue;}
    const solids=landmarkSolids(b);
    assert.ok(solids.length>=2,spec.name+' has multiple masses');
    for(const s of solids){
      assert.ok([s.x,s.y,s.z,s.w,s.h,s.d,s.rotation].every(Number.isFinite));
      assert.ok(s.w>0&&s.h>0&&s.d>0);
      assert.ok(Math.abs(s.x-b.x)+s.w/2<=b.w/2+.02,'no facade beyond the street collision budget');
      assert.ok(Math.abs(s.z-b.z)+s.d/2<=b.d/2+.02,'no protrusion into the road');
      assert.ok(s.y-s.h/2>=CITY_BASE-.001);
      assert.ok(s.y+s.h/2<=CITY_BASE+b.h+.001);
    }
  }
});
test('elevated skybridges are uniquely indexed to streaming tiles',()=>{
  assert.ok(CITY_BRIDGES.length>=2);
  assert.equal(new Set(CITY_BRIDGES.map(s=>s.id)).size,CITY_BRIDGES.length);
  for(const bridge of CITY_BRIDGES){
    assert.ok(bridge.y>14,'walkable streets remain unobstructed');
    const tile=bridgesForChunk(Math.round(bridge.x/96),Math.round(bridge.z/96));
    assert.ok(tile.some(x=>x.id===bridge.id));
  }
});
test('Rapier blocks an authored podium and retains walkable surrounding streets',async()=>{
  const runtime=await PhysicsRuntime.create();
  const b=BUILDINGS.find(b=>b.id==='0:-5')!;
  const origin={x:b.x+b.w*.465+2,z:b.z,
    y:groundHeight(b.x+b.w*.465+2,b.z)+EYE_HEIGHT,
    vy:0,grounded:true,jumpHeld:false};
  runtime.updateScenery([origin]);
  const before=origin.x;
  const input={type:'input' as const,seq:1,forward:0,strafe:-1,yaw:0,sprint:true,jump:false,interact:false};
  for(let i=0;i<40;i++)runtime.move('landmark',origin,input,.05);
  assert.ok(origin.x<before-1,'can approach podium');
  assert.ok(origin.x>b.x+b.w*.465+.25,'cannot phase into authored structure');
  runtime.free();
});
