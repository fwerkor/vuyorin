import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { BUILDINGS, nearbyObstacles, sceneryForChunk } from '../shared/city.js';
import { WORLD_LIMIT, CHUNK_SIZE, terrainHeight, terrainBiome } from '../shared/world.js';
import { blockedAt, advanceMotion, groundHeight, EYE_HEIGHT } from '../shared/physics.js';
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

test('shared city collision blocks walls but allows public streets',()=>{
  const b=BUILDINGS[0];
  assert.ok(blockedAt(b.x,b.z,groundHeight(b.x,b.z)));
  const x=b.x+b.w/2+3;
  const z=b.z;
  assert.equal(nearbyObstacles(b.x,b.z).length>0,true);
  assert.equal(blockedAt(x,z,groundHeight(x,z)),false);
  const state={x:x,y:groundHeight(x,z)+EYE_HEIGHT,z,vy:0,grounded:true,jumpHeld:false};
  const start={...state};
  const input={type:'input' as const,seq:1,forward:0,strafe:-1,yaw:0,sprint:false,jump:false};
  for(let i=0;i<40;i++)advanceMotion(state,input,.05);
  assert.ok(state.x>=b.x+b.w/2+.32,'cannot enter a building facade');
  assert.ok(state.x<start.x,'can approach the building');
});

test('world boundary cannot be crossed even with repeated sprint inputs',()=>{
  const state={x:WORLD_LIMIT-.2,y:groundHeight(WORLD_LIMIT-.2,120)+EYE_HEIGHT,
    z:120,vy:0,grounded:true,jumpHeld:false};
  const input={type:'input' as const,seq:1,forward:0,strafe:1,yaw:0,sprint:true,jump:false};
  for(let i=0;i<150;i++)advanceMotion(state,input,.05);
  assert.equal(state.x,WORLD_LIMIT);
});
