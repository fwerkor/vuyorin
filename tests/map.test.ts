import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { BUILDINGS, sceneryForChunk } from '../shared/city.js';
import { PORT_SHAPES } from '../shared/harbor.js';
import { WORLD_LIMIT, CHUNK_SIZE, terrainHeight, terrainBiome } from '../shared/world.js';
import { PhysicsRuntime, groundHeight, EYE_HEIGHT } from '../shared/physics.js';
import { decodeTile } from '../client/terrain-binary.js';
import { withinWorld } from '../client/terrain-data.js';

test('the v1 world is strictly bounded and terrain stays deterministic', () => {
  assert.equal(WORLD_LIMIT,1968);
  assert.equal(CHUNK_SIZE,96);
  assert.ok(withinWorld(20,20));
  assert.equal(withinWorld(21,0),false);
  for(const z of [-1900,-1100,-700,-300,0,750,1500,1900]){
    for(const x of [-1900,-900,-200,30,700,1600,1900]){
      assert.ok(Number.isFinite(terrainHeight(x,z)));
      assert.equal(terrainHeight(x,z),terrainHeight(x,z));
    }
  }
  assert.equal(terrainBiome(25,-300),'city');
  assert.ok(BUILDINGS.length>=40);
});

test('baked terrain bytes decode at every LOD and agree with server-side height', async () => {
  const coords:[[number,number],[number,number],[number,number]]=[[0,0],[0,-3],[20,20]];
  for(const [cx,cz] of coords){
    const raw=await readFile(new URL(`../client/public/world/v1/${cx}_${cz}.bin`,import.meta.url));
    const source=raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength);
    for(let lod=0;lod<3;lod++){
      const decoded=decodeTile(source,{key:cx+','+cz,cx,cz,lod});
      const steps=32/(2**lod);
      assert.equal(decoded.positions.length/3,(steps+1)*(steps+1)+4*(steps+1));
      assert.ok(decoded.indices.length>0);
      assert.ok(decoded.colors.every(Number.isFinite));
      for(let j=0;j<=steps;j+=Math.max(1,Math.floor(steps/4))){
        for(let i=0;i<=steps;i+=Math.max(1,Math.floor(steps/4))){
          const k=(j*(steps+1)+i)*3;
          const x=cx*CHUNK_SIZE+decoded.positions[k];
          const z=cz*CHUNK_SIZE+decoded.positions[k+2];
          assert.ok(Math.abs(decoded.positions[k+1]-terrainHeight(x,z))<.063,'baked height quantization');
        }
      }
      const reference=sceneryForChunk(cx,cz);
      assert.equal(decoded.trees.length,reference.trees.length);
      assert.equal(decoded.rocks.length,reference.rocks.length);
    }
  }
  await assert.rejects(async()=>{
    decodeTile(new Uint8Array([1,2,3,4]).buffer,{key:'0,0',cx:0,cz:0,lod:0});
  });
});

test('Rapier colliders mirror ALL port meshes including railings and containers', async()=>{
  const physics=await PhysicsRuntime.create();
  const obstacles=PORT_SHAPES.filter(s=>s.solid);
  assert.ok(obstacles.length>=50);
  assert.equal(new Set(PORT_SHAPES.map(o=>o.id)).size,PORT_SHAPES.length);
  assert.equal(PORT_SHAPES.filter(s=>/^container-\d+$/.test(s.id) && s.solid).length,8);
  assert.ok(PORT_SHAPES.some(s=>s.id==='quay-guard-south' && s.solid));
  const motion=(x:number,z:number)=>({x,z,y:groundHeight(x,z)+EYE_HEIGHT,vy:0,grounded:true,jumpHeld:false});
  const input={type:'input' as const,seq:1,forward:0,strafe:1,yaw:0,sprint:true,jump:false};
  const box=motion(35,40.2);
  physics.updateScenery([box]);
  for(let i=0;i<80;i++)physics.move('box',box,input,.05);
  // Container 5 is centred at (41, 40.2), width 7.3; the capsule must stay outside its west wall.
  assert.ok(box.x<37.01 && box.x>36.5,'continuous sweep must stop outside the container wall');
  const guard=motion(10,57);
  physics.updateScenery([guard]);
  for(let i=0;i<80;i++)physics.move('guard',guard,{...input,forward:1,strafe:0},.05);
  assert.ok(guard.z>52.74 && guard.z<53,'quay guardrail cannot be crossed');
  const slide=motion(18,44);
  physics.updateScenery([slide]);
  for(let i=0;i<35;i++)physics.move('slide',slide,{...input,forward:1,strafe:1},.05);
  assert.ok(Math.hypot(slide.x-18,slide.z-44)>2,'characters can slide along obstacles');
  physics.removeActor('box');physics.removeActor('guard');physics.removeActor('slide');
  physics.free();
});

test('Rapier blocks city buildings and applies hard world boundaries',async()=>{
  const physics=await PhysicsRuntime.create();
  const b=BUILDINGS[0];
  const x=b.x+b.w/2+3,z=b.z;
  const state={x,y:groundHeight(x,z)+EYE_HEIGHT,z,vy:0,grounded:true,jumpHeld:false};
  const m={type:'input' as const,seq:1,forward:0,strafe:-1,yaw:0,sprint:false,jump:false};
  physics.updateScenery([state]);
  for(let i=0;i<60;i++)physics.move('building',state,m,.05);
  assert.ok(state.x>b.x+b.w/2+0.3,'player capsule cannot enter building walls');
  const edge={x:WORLD_LIMIT-.2,y:groundHeight(WORLD_LIMIT-.2,120)+EYE_HEIGHT,
    z:120,vy:0,grounded:true,jumpHeld:false};
  physics.updateScenery([edge]);
  for(let i=0;i<150;i++)physics.move('edge',edge,{...m,strafe:1,sprint:true},.05);
  assert.equal(edge.x,WORLD_LIMIT);
  physics.free();
});
