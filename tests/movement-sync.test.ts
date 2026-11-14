import assert from 'node:assert/strict';
import test from 'node:test';
import type { ClientInput } from '../shared/protocol.js';
import { isMoving, reconcileSelf, remoteBlendFactor, shouldSendInput } from '../shared/movement-sync.js';

const stopped: ClientInput = {
  type:'input',seq:10,forward:0,strafe:0,yaw:0,sprint:false,jump:false
};
const moving: ClientInput = {...stopped,seq:11,forward:1};

test('movement detection recognizes neutral and directional input',()=>{
  assert.equal(isMoving(stopped),false);
  assert.equal(isMoving(moving),true);
});

test('stop is sent immediately but idle input is rate-limited',()=>{
  assert.equal(shouldSendInput(stopped,null,0),true);
  assert.equal(shouldSendInput(stopped,moving,4,true),true);
  assert.equal(shouldSendInput(stopped,stopped,51),false);
  assert.equal(shouldSendInput(stopped,stopped,2999),false);
  assert.equal(shouldSendInput(stopped,stopped,3000),true);
  assert.equal(shouldSendInput(moving,moving,50),true);
  assert.equal(shouldSendInput({...stopped,yaw:.4},stopped,51),true);
  assert.equal(shouldSendInput({...stopped,yaw:.4},stopped,10),false);
  assert.equal(shouldSendInput({...moving,jump:true},moving,2,true),true);
});

test('stale snapshot never pulls stopped player backward before stop is acknowledged',()=>{
  const local={x:20,y:5,z:40};
  const stale={x:19.65,y:5,z:40};
  assert.deepEqual(reconcileSelf(local,stale,false,false,true),local);
  assert.deepEqual(reconcileSelf(local,stale,true,false,true),local);
});

test('acknowledged stop reconciles once, then rests exactly',()=>{
  const local={x:20,y:5,z:40},server={x:19.7,y:5.02,z:40};
  const corrected=reconcileSelf(local,server,false,true,true);
  assert.deepEqual(corrected,server);
  for(let i=0;i<60;i++) {
    assert.deepEqual(reconcileSelf(corrected,server,false,true,true),server);
  }
  assert.deepEqual(reconcileSelf(local,{x:20.003,y:5,z:40},false,true,true),local);
});

test('airborne state keeps client vertical prediction, large desync teleports',()=>{
  const local={x:20,y:6,z:40};
  assert.deepEqual(reconcileSelf(local,{x:19.9,y:4,z:40},false,true,false),{x:19.9,y:6,z:40});
  assert.deepEqual(reconcileSelf(local,{x:40,y:8,z:40},true,false,false),{x:40,y:8,z:40});
});

test('remote avatars finish interpolation exactly instead of asymptotic jitter',()=>{
  assert.equal(remoteBlendFactor(.009,.016,false),1);
  assert.equal(remoteBlendFactor(.11,.016,true),1);
  assert.ok(remoteBlendFactor(.8,.016,true)>0 && remoteBlendFactor(.8,.016,true)<1);
  assert.equal(remoteBlendFactor(.8,0,false),0);
});

test('interaction E is forwarded immediately without movement and preserves idle handling', () => {
  const original={type:'input' as const,seq:3,forward:0,strafe:0,yaw:0,sprint:false,jump:false,interact:false};
  const pressed={...original,interact:true};
  assert.equal(shouldSendInput(pressed,original,4,true),true);
  assert.equal(shouldSendInput(pressed,original,4,false),false);
  assert.equal(shouldSendInput(pressed,original,51,false),true);
  assert.equal(shouldSendInput(original,pressed,4,true),true);
});
