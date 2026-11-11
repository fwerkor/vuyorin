import assert from 'node:assert/strict';
import test from 'node:test';
import { PhysicsRuntime, groundHeight } from '../shared/physics.js';
import type { ClientInput } from '../shared/protocol.js';

test('server and client physics preserve exact horizontal position during long idle',async()=>{
  const physics=await PhysicsRuntime.create();
  try {
    const state={x:18,y:groundHeight(18,44)+1.7,z:44,vy:0,grounded:true,jumpHeld:false};
    physics.updateScenery([state]);
    const moving:ClientInput={type:'input',seq:1,forward:1,strafe:0,yaw:0,sprint:false,jump:false};
    const idle:ClientInput={...moving,seq:2,forward:0};
    for(let i=0;i<12;i++)physics.move('test',state,moving,.05);
    const position={x:state.x,z:state.z};
    for(let i=0;i<120;i++)physics.move('test',state,idle,.05);
    assert.equal(state.x,position.x);
    assert.equal(state.z,position.z);
    assert.equal(state.y,groundHeight(state.x,state.z)+1.7);
  } finally {physics.free();}
});
