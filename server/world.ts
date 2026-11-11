import WebSocket, { WebSocketServer } from 'ws';
import type { Server as HTTPServer, IncomingMessage } from 'node:http';
import { randomUUID } from 'node:crypto';
import { SPAWN, wrapAngle } from '../shared/world.js';
import { PhysicsRuntime, EYE_HEIGHT, groundHeight } from '../shared/physics.js';
import { DEFAULT_APPEARANCE, validAppearance } from '../shared/appearance.js';
import type { ClientInput, ClientMessage, PlayerState, ServerMessage } from '../shared/protocol.js';
import { userFromRequest, type User } from './auth.js';

interface Actor { socket: WebSocket; user: User; state: PlayerState; input: ClientInput; lastSeq: number; vy: number; grounded: boolean; jumpHeld: boolean; }
const actors = new Map<string, Actor>();
const DEFAULT_INPUT: ClientInput = { type: 'input', seq: 0, forward: 0, strafe: 0, yaw: 0, sprint: false, jump: false };
const TICK_MS = 50;
const MAX_VISIBLE_DISTANCE_SQ = 280 * 280;
export function validInput(v: unknown): v is ClientInput {
  if (!v || typeof v !== 'object') return false;
  const m = v as Record<string, unknown>;
  return m.type === 'input' && Number.isSafeInteger(m.seq) && Number(m.seq) >= 0 &&
    typeof m.forward === 'number' && Number.isFinite(m.forward) && Math.abs(m.forward) <= 1 &&
    typeof m.strafe === 'number' && Number.isFinite(m.strafe) && Math.abs(m.strafe) <= 1 &&
    typeof m.yaw === 'number' && Number.isFinite(m.yaw) && Math.abs(m.yaw) <= Math.PI * 4 &&
    typeof m.sprint === 'boolean' && typeof m.jump === 'boolean';
}
const send = (ws: WebSocket, msg: ServerMessage) => {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
};
function integrate(a: Actor, dt: number, physics: PhysicsRuntime) {
  const m = a.input;
  const motion = { x:a.state.x, y:a.state.y, z:a.state.z, vy:a.vy, grounded:a.grounded, jumpHeld:a.jumpHeld };
  physics.move(a.state.id,motion,m,dt);
  Object.assign(a.state,{x:motion.x,y:motion.y,z:motion.z});
  a.state.yaw=wrapAngle(m.yaw);
  a.vy=motion.vy;a.grounded=motion.grounded;a.jumpHeld=motion.jumpHeld;
}
export function attachMultiplayer(server: HTTPServer, physics: PhysicsRuntime): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 8192, perMessageDeflate: false });
  const activeByUser=new Map<string,string>();
  server.on('upgrade', (req: IncomingMessage, socket, head) => {
    const user = userFromRequest(req);
    const origin = req.headers.origin;
    const expected = process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
    const allowed = new Set([new URL(expected).origin, 'http://localhost:5173']);
    if (!user || !origin || !allowed.has(origin) || req.url !== '/ws') {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); socket.destroy(); return;
    }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, user));
  });
  wss.on('connection', (socket: WebSocket, user: User) => {
    // Replacement is synchronous: only one world actor may exist per OIDC subject.
    const previousId=activeByUser.get(user.id);
    if(previousId){
      const previous=actors.get(previousId);
      if(previous){
        actors.delete(previousId);
        physics.removeActor(previousId);
        previous.socket.close(4009,'Account entered in another tab');
      }
    }
    const id = randomUUID();
    let spawnX=SPAWN.x,spawnZ=SPAWN.z,spawnY=groundHeight(spawnX,spawnZ)+EYE_HEIGHT;
    for(let i=0;i<400;i++){
      const angle=i*2.399963229728653;
      const radius=Math.sqrt(i)*1.12;
      const cx=SPAWN.x+Math.cos(angle)*radius,cz=SPAWN.z+Math.sin(angle)*radius;
      const cy=groundHeight(cx,cz)+EYE_HEIGHT;
      if(physics.canOccupy(cx,cy,cz)){spawnX=cx;spawnZ=cz;spawnY=cy;break;}
    }
    const actor: Actor = { socket, user, state: { id, name: user.name, x: spawnX, y: spawnY, z: spawnZ, yaw: 0, appearance:{...DEFAULT_APPEARANCE} }, input: { ...DEFAULT_INPUT }, lastSeq: 0, vy: 0, grounded: true, jumpHeld: false };
    actors.set(id, actor);
    activeByUser.set(user.id,id);
    physics.setActorPosition(id,actor.state);
    send(socket, { type: 'welcome', id, tickRate: 1000 / TICK_MS, players: [...actors.values()].map(p => p.state) });
    socket.on('message', data => {
      let msg: ClientMessage;
      try { msg = JSON.parse(data.toString()) as ClientMessage; } catch { socket.close(1003, 'invalid message'); return; }
      if (validInput(msg)) {
        if (msg.seq <= actor.lastSeq) return;
        actor.lastSeq = msg.seq;
        actor.input = msg;
      } else if (msg?.type === 'appearance' && validAppearance(msg.appearance)) {
        actor.state.appearance={...msg.appearance};
      } else if (msg?.type === 'ping' && typeof msg.sent === 'number' && Number.isFinite(msg.sent)) {
        send(socket, { type: 'pong', sent: msg.sent });
      } else socket.close(1003, 'invalid payload');
    });
    const cleanup=()=>{
      // A replaced socket must not remove the new actor or account binding.
      if(actors.get(id)===actor){actors.delete(id);physics.removeActor(id);}
      if(activeByUser.get(user.id)===id)activeByUser.delete(user.id);
    };
    socket.on('close', cleanup);
    socket.on('error', cleanup);
  });
  let tick = 0;
  const timer = setInterval(() => {
    tick++;
    physics.updateScenery([...actors.values()].map(a=>a.state));
    for (const actor of actors.values()) integrate(actor, TICK_MS / 1000, physics);
    physics.world.step();
    if (tick % 2 === 0) for (const actor of actors.values()) {
      const a = actor.state;
      const players = [...actors.values()].filter(b => (b.state.x - a.x) ** 2 + (b.state.z - a.z) ** 2 < MAX_VISIBLE_DISTANCE_SQ).map(b => b.state);
      send(actor.socket, { type: 'snapshot', players, ack: actor.lastSeq, time: Date.now(), online: actors.size });
    }
  }, TICK_MS);
  wss.on('close', () => clearInterval(timer));
  return wss;
}
