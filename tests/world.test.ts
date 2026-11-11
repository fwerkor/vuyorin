import assert from 'node:assert/strict';
import test from 'node:test';
import { hash2, SPAWN, terrainHeight, clampWorld, WORLD_LIMIT, smoothstep, wrapAngle } from '../shared/world.js';
import { validInput } from '../server/world.js';
test('terrain is deterministic and finite', () => {
  for (const x of [-700, -12, 0, 123, 800]) for (const z of [-600, -3, 0, 43, 700]) {
    assert.equal(terrainHeight(x,z), terrainHeight(x,z)); assert.ok(Number.isFinite(terrainHeight(x,z)));
    assert.ok(hash2(x,z) >= 0 && hash2(x,z) < 1);
  }
  assert.ok(terrainHeight(SPAWN.x, SPAWN.z) > 0);
});
test('world bounds and smoothstep', () => {
  assert.equal(clampWorld(1e9), WORLD_LIMIT); assert.equal(clampWorld(-1e9), -WORLD_LIMIT);
  assert.equal(smoothstep(0,10,-2), 0); assert.equal(smoothstep(0,10,15), 1);
});
test('input validation rejects forged position, bad axes and NaN', () => {
  const good = { type:'input', seq:1, forward:1, strafe:0, yaw:0, sprint:false, jump:false };
  assert.ok(validInput(good));
  assert.equal(validInput({...good,forward:2}), false);
  assert.equal(validInput({...good,yaw:NaN}), false);
  assert.equal(validInput({...good,seq:-1}), false);
  assert.equal(validInput({...good,jump:'true'}), false);
});

test('camera yaw stays in the server-accepted interval after many turns', () => {
  for (const turns of [-10000, -79, -3, 0, 1, 40, 10000]) {
    const angle = wrapAngle(turns * 2 * Math.PI + .42);
    assert.ok(angle >= -Math.PI && angle < Math.PI);
    assert.ok(Math.abs(angle - .42) < 1e-10);
    assert.ok(validInput({type:'input',seq:1,forward:0,strafe:0,yaw:angle,sprint:false,jump:false}));
  }
});
