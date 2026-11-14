import assert from 'node:assert/strict';
import test from 'node:test';
import { BUILDINGS } from '../shared/city.js';
import { HALO_LEVELS, HALO_LIFT, haloInterior, haloFloorIndex, haloLiftNearby,
  haloNextFloor, haloSupportHeight, isHalo } from '../shared/halo.js';
import { PhysicsRuntime, EYE_HEIGHT, groundHeight } from '../shared/physics.js';

const b=BUILDINGS.find(x=>isHalo(x))!;
const plan=haloInterior(b);
const move=(forward:number,strafe:number,interact=false,sprint=false)=>
  ({type:'input' as const,seq:1,yaw:0,forward,strafe,jump:false,interact,sprint});
const actor=(x:number,z:number,level=0)=>({
  x,z,y:HALO_LEVELS[level]+EYE_HEIGHT,vy:0,grounded:true,
  jumpHeld:false,interactHeld:false,lift:null as import('../shared/physics.js').LiftTravel|null
});

test('HALO interior is an authored multi-room destination, never a solid building',()=>{
  assert.equal(b.id,'0:-3');
  assert.ok(plan.length>175,'enough unique authored fittings');
  assert.equal(new Set(plan.map(p=>p.id)).size,plan.length);
  assert.ok(plan.some(p=>p.id==='ground-south-left'&&p.solid));
  assert.ok(plan.some(p=>p.id==='ground-south-right'&&p.solid));
  assert.ok(plan.some(p=>p.id==='cafe-counter'&&p.solid));
  assert.ok(plan.some(p=>p.id==='reception-counter'&&p.solid));
  assert.ok(plan.some(p=>p.id==='sky-sofa-7'&&p.solid));
  assert.ok(plan.some(p=>p.id==='observation-disk'&&p.solid));
  assert.ok(plan.every(p=>[p.x,p.y,p.z,p.w,p.h,p.d,p.yaw].every(Number.isFinite)));
  assert.ok(plan.every(p=>p.w>0&&p.h>0&&p.d>0));
  // The entrance must be a genuine corridor, not a hidden front-wall cuboid.
  for(const part of plan.filter(p=>p.solid)){
    const lowZ=part.z-part.d/2, highZ=part.z+part.d/2;
    const lowX=part.x-part.w/2, highX=part.x+part.w/2;
    if(lowZ<-122.12||highZ>-121.82)continue;
    if(lowX<=28.7&&highX>=27.3)
      assert.ok(part.y-part.h/2>HALO_LEVELS[0]+2,'nothing blocks walking-height entrance: '+part.id);
  }
});

test('level supports discriminate hollow atrium, mezzanine and observation floor',()=>{
  assert.equal(haloSupportHeight(28,-140,HALO_LEVELS[0]),null);
  assert.equal(haloSupportHeight(28,-140,HALO_LEVELS[1]),null,'atrium is open');
  assert.equal(haloSupportHeight(38,-147,HALO_LEVELS[1]),HALO_LEVELS[1]);
  assert.equal(haloSupportHeight(38,-147,HALO_LEVELS[2]),HALO_LEVELS[2]);
  assert.equal(haloSupportHeight(28,-140,HALO_LEVELS[2]),HALO_LEVELS[2]);
  assert.equal(haloFloorIndex(HALO_LEVELS[0]),0);
  assert.equal(haloFloorIndex(HALO_LEVELS[1]),1);
  assert.equal(haloFloorIndex(HALO_LEVELS[2]),2);
  assert.ok(haloLiftNearby(HALO_LIFT.x,HALO_LIFT.z,HALO_LEVELS[0]));
  assert.equal(haloNextFloor(HALO_LEVELS[2]),0);
});

test('open main entrance permits walking into furnished lobby; walls remain solid',async()=>{
  const physics=await PhysicsRuntime.create();
  const person=actor(28,-116.4);
  physics.updateScenery([person]);
  for(let n=0;n<44;n++)physics.move('entry',person,move(1,0),.05);
  assert.ok(person.z<-123.5,'must enter through the actual glass wall doorway: '+person.z);
  assert.ok(person.z>-142,'pedestal protects the main artwork');
  const wall=actor(47.3,-140);
  for(let n=0;n<40;n++)physics.move('wall',wall,move(0,-1,true),.05);
  assert.ok(wall.x>45.9,'exterior glazing remains collidable: '+wall.x);
  physics.free();
});

test('authoritative elevator animates every level, ignores held E, and cycles safely',async()=>{
  const physics=await PhysicsRuntime.create();
  const person=actor(HALO_LIFT.x,HALO_LIFT.z);
  physics.updateScenery([person]);
  for(let level=1;level<=3;level++){
    const oldY=person.y;
    physics.move('lift',person,move(0,0,true),.05);
    assert.ok(person.lift,'pressing E from elevator starts an actual journey');
    assert.equal(person.y,oldY,'no instant teleport');
    const steps=Math.ceil(person.lift!.duration/.05);
    let previous=person.y;
    for(let n=0;n<steps+2;n++){
      physics.move('lift',person,move(0,0,true),.05);
      const upward=level<3;
      if(n<steps-1)
        assert.ok(upward?person.y>=previous-.001:person.y<=previous+.001,'smooth monotonic cabin travel');
      previous=person.y;
    }
    assert.ok(!person.lift,'journey completes');
    assert.ok(Math.abs(person.y-EYE_HEIGHT-HALO_LEVELS[level%3])<.07,
      'arrived exactly on target level '+level);
    for(let held=0;held<8;held++)physics.move('lift',person,move(0,0,true),.05);
    assert.ok(Math.abs(person.y-EYE_HEIGHT-HALO_LEVELS[level%3])<.07,'held E is debounced');
    physics.move('lift',person,move(0,0,false),.05);
  }
  assert.equal(person.x,HALO_LIFT.x);
  physics.free();
});

test('elevator interaction is spatially and vertically authorized',async()=>{
  const physics=await PhysicsRuntime.create();
  for(const [id,x,z,y] of [
    ['remote',HALO_LIFT.x+20,HALO_LIFT.z,HALO_LEVELS[0]],
    ['outside',HALO_LIFT.x,HALO_LIFT.z+20,HALO_LEVELS[0]],
    ['roof',HALO_LIFT.x,HALO_LIFT.z,HALO_LEVELS[2]+14]
  ] as const){
    const a={...actor(x,z),y:y+EYE_HEIGHT};
    physics.move(id,a,move(0,0,true),.05);
    assert.ok(!a.lift,'lift should reject unauthorized location');
  }
  physics.free();
});

test('lobby furniture, mezzanine railing and sky gallery are physical objects',async()=>{
  const physics=await PhysicsRuntime.create();
  const chair=actor(13,-139);
  physics.updateScenery([chair]);
  const x0=chair.x;
  for(let i=0;i<50;i++)physics.move('furniture',chair,move(0,1),.05);
  assert.ok(chair.x>x0,'can approach lounge from outside');
  assert.ok(chair.x<17.3,'cannot pass through the west sofa');
  const mezz=actor(38,-147,1);
  for(let i=0;i<20;i++)physics.move('mezz',mezz,move(0,0),.05);
  assert.ok(Math.abs(mezz.y-EYE_HEIGHT-HALO_LEVELS[1])<.06);
  const upper=actor(38,-147,2);
  for(let i=0;i<20;i++)physics.move('sky',upper,move(0,0),.05);
  assert.ok(Math.abs(upper.y-EYE_HEIGHT-HALO_LEVELS[2])<.06);
  physics.free();
});

test('the original harbor has a public route north to the open building',async()=>{
  const physics=await PhysicsRuntime.create();
  const person=actor(28,20.5);
  person.y=groundHeight(28,20.5)+EYE_HEIGHT;
  physics.updateScenery([person]);
  for(let i=0;i<35;i++)physics.move('harbor-egress',person,move(1,0),.05);
  assert.ok(person.z<18,'the north guardrail must not seal the public exit: '+person.z);
  physics.free();
});
