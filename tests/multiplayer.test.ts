import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import WebSocket from 'ws';
import { PhysicsRuntime, PLAYER_RADIUS } from '../shared/physics.js';
import { attachMultiplayer } from '../server/world.js';
import type { ServerMessage } from '../shared/protocol.js';

interface TestClient { socket:WebSocket; messages:ServerMessage[] }
async function waitFor(client:TestClient, predicate:(message:ServerMessage)=>boolean):Promise<ServerMessage>{
  for(let i=0;i<150;i++){
    const message=client.messages.find(predicate);
    if(message)return message;
    await delay(15);
  }
  throw new Error('Timed out waiting for multiplayer message');
}

test('one role per account, replacement, safe spawn and outfit replication over real sockets',
  {timeout:30_000},async()=>{
  const physics=await PhysicsRuntime.create();
  const server=createServer((_req,res)=>{res.statusCode=404;res.end();});
  const wss=attachMultiplayer(server,physics,req=>{
    const subject=req.headers['x-test-subject'];
    return typeof subject==='string'?{id:subject,name:subject}:null;
  });
  const sockets:WebSocket[]=[];
  try{
    server.listen(0,'127.0.0.1');await once(server,'listening');
    const addr=server.address();
    assert.ok(addr&&typeof addr==='object');
    const connect=async(subject:string):Promise<TestClient>=>{
      const socket=new WebSocket('ws://127.0.0.1:'+addr.port+'/ws',{
        origin:'http://localhost:5173',headers:{'x-test-subject':subject}
      });
      sockets.push(socket);
      const client:TestClient={socket,messages:[]};
      socket.on('message',data=>client.messages.push(JSON.parse(data.toString()) as ServerMessage));
      await once(socket,'open');
      await waitFor(client,m=>m.type==='welcome');
      return client;
    };
    const first=await connect('alice');
    const replaced=once(first.socket,'close');
    const second=await connect('alice');
    const [closeCode]=await replaced;
    assert.equal(closeCode,4009,'the old connection must stop, never reconnect automatically');
    const welcome=second.messages.find(m=>m.type==='welcome');
    assert.ok(welcome&&welcome.type==='welcome');
    assert.equal(welcome.players.length,1,'duplicate connection must not spawn two characters');
    const third=await connect('bob');
    const bWelcome=third.messages.find(m=>m.type==='welcome');
    assert.ok(bWelcome&&bWelcome.type==='welcome');
    assert.equal(bWelcome.players.length,2,'only two distinct accounts are visible');
    const [one,two]=bWelcome.players;
    assert.ok(Math.hypot(one.x-two.x,one.z-two.z)>=PLAYER_RADIUS*2,
      'distinct accounts must not spawn overlapping');
    const appearance={head:'wanderer',body:'neon',backpack:'reactor'};
    third.socket.send(JSON.stringify({type:'appearance',appearance}));
    const snapshot=await waitFor(second,m=>m.type==='snapshot'&&m.online===2&&
      m.players.some(p=>p.name==='bob'&&p.appearance.body==='neon'));
    assert.equal(snapshot.type,'snapshot');
  }finally{
    for(const socket of sockets)socket.terminate();
    await new Promise<void>(resolve=>wss.close(()=>resolve()));
    await new Promise<void>(resolve=>server.close(()=>resolve()));
    physics.free();
  }
});
