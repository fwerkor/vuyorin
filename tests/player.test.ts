import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_APPEARANCE, safeAppearance, validAppearance } from '../shared/appearance.js';
import { EYE_HEIGHT, PLAYER_RADIUS, PhysicsRuntime, groundHeight } from '../shared/physics.js';

test('appearance choices are independently customizable and strictly whitelisted', () => {
  const choice={head:'sentinel',body:'ember',backpack:'reactor'};
  assert.equal(validAppearance(choice),true);
  assert.deepEqual(safeAppearance(choice),choice);
  for(const candidate of [null,{},['explorer'],{...choice,head:'<script>'},{...choice,admin:true},{...choice,body:4}]){
    assert.equal(validAppearance(candidate),false);
    assert.deepEqual(safeAppearance(candidate),DEFAULT_APPEARANCE);
  }
});

test('Rapier players occupy solid capsules and local prediction cannot walk through peers', { timeout:30_000 }, async () => {
  const physics=await PhysicsRuntime.create();
  try {
    const x=1420,z=1420,y=groundHeight(x,z)+EYE_HEIGHT;
    physics.setActorPosition('server-peer',{x,y,z});
    assert.equal(physics.canOccupy(x,y,z),false,'new spawn must not overlap a player');
    assert.equal(physics.canOccupy(x+4,y,z),true,'free space should be available');
    physics.removeActor('server-peer');

    physics.syncRemoteActors([{id:'other',x,y,z}]);
    const m={type:'input' as const,seq:1,forward:1,strafe:0,yaw:0,sprint:false,jump:false};
    const player={x,y:groundHeight(x,z+2)+EYE_HEIGHT,z:z+2,vy:0,grounded:true,jumpHeld:false};
    for(let i=0;i<15;i++)physics.move('local',player,m,.05);
    assert.ok(player.z-z >= PLAYER_RADIUS*2-.12,
      'front-facing player must stop before another player collider');
    physics.syncRemoteActors([]);
    physics.removeActor('local');
    assert.equal(physics.canOccupy(x,y,z),true,'disconnect removes remote collider');
  }finally{
    physics.free();
  }
});
