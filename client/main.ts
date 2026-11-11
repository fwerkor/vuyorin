import './style.css';
import { GameWorld } from './world';
import { SPAWN, wrapAngle } from '../shared/world';
import { advanceMotion, groundHeight } from '../shared/physics';
import type { ClientInput, PlayerState, ServerMessage } from '../shared/protocol';

const canvas=document.getElementById('world') as HTMLCanvasElement;
const world=new GameWorld(canvas);
const intro=document.getElementById('intro')!;
const introState=document.getElementById('introState')!;
const signin=document.getElementById('signin') as HTMLAnchorElement;
const enter=document.getElementById('enter') as HTMLButtonElement;
const status=document.getElementById('status')!;
const online=document.getElementById('onlineCount')!;
const heading=document.getElementById('heading')!;
const coords=document.getElementById('coords')!;
const hint=document.getElementById('hint')!;
const toast=document.getElementById('toast')!;
let loggedIn=false, started=false, selfId='', socket:WebSocket|null=null, seq=0;
let yaw=0, pitch=-.035, x=SPAWN.x, z=SPAWN.z, y=groundHeight(x,z)+1.7, vy=0, grounded=true, jumpHeld=false;
let lastFrame=performance.now(), lastInput=0;
const held=new Set<string>();
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
function showToast(text:string){toast.textContent=text;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),3000);}
function connect(){
  if(socket && socket.readyState<=WebSocket.OPEN)return;
  const protocol=location.protocol==='https:'?'wss:':'ws:';
  socket=new WebSocket(`${protocol}//${location.host}/ws`);
  status.textContent='正在连接共享世界';
  socket.addEventListener('open',()=>{status.textContent='已连接 · 世界在线';status.classList.add('live');showToast('欢迎来到雾曜纪');});
  socket.addEventListener('message',(evt)=>{
    let msg:ServerMessage;try{msg=JSON.parse(evt.data);}catch{return;}
    if(msg.type==='welcome'){selfId=msg.id;world.syncPlayers(msg.players,selfId);}
    else if(msg.type==='snapshot') {
      online.textContent=String(msg.online);
      const self=msg.players.find(p=>p.id===selfId);
      if(self){
        const d=Math.hypot(self.x-x,self.z-z);
        if(d>7){x=self.x;z=self.z;y=self.y;}
        else {x+=(self.x-x)*.055;z+=(self.z-z)*.055;y+=(self.y-y)*.07;}
      }
      world.syncPlayers(msg.players,selfId);
    }
  });
  socket.addEventListener('close',()=>{
    socket=null;selfId='';world.syncPlayers([],selfId);online.textContent='0';status.classList.remove('live');status.textContent='连接中断 · 正在重连';
    if(started && loggedIn)setTimeout(connect,2200);
  });
  socket.addEventListener('error',()=>status.textContent='服务器连接异常');
}
function input():ClientInput {
  return {type:'input',seq:++seq,
    forward:Number(held.has('KeyW')||held.has('ArrowUp'))-Number(held.has('KeyS')||held.has('ArrowDown')),
    strafe:Number(held.has('KeyD')||held.has('ArrowRight'))-Number(held.has('KeyA')||held.has('ArrowLeft')),
    yaw, sprint:held.has('ShiftLeft')||held.has('ShiftRight'),jump:held.has('Space')};
}
function start(){
  if(!loggedIn)return;
  started=true;intro.classList.add('hidden');hint.classList.add('visible');
  connect();canvas.requestPointerLock?.();
}
enter.addEventListener('click',start);
canvas.addEventListener('click',()=>{if(started&&document.pointerLockElement!==canvas)canvas.requestPointerLock?.();});
document.addEventListener('pointerlockchange',()=>{if(!started)return;if(document.pointerLockElement!==canvas){hint.textContent='点击画面恢复视角 · ESC 释放鼠标';}else hint.textContent='W A S D 移动 · 鼠标环视 · SHIFT 奔跑 · 空格跳跃';});
document.addEventListener('mousemove',(e)=>{if(document.pointerLockElement!==canvas)return;
  yaw=wrapAngle(yaw-e.movementX*.0024); pitch=clamp(pitch-e.movementY*.0023,-1.45,1.45);
});
document.addEventListener('keydown',e=>{
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
  held.add(e.code);
});
document.addEventListener('keyup',e=>held.delete(e.code));
window.addEventListener('blur',()=>held.clear());
async function checkAuth(){
  try {
    const response=await fetch('/api/me',{credentials:'same-origin',cache:'no-store'});
    if(!response.ok)throw new Error('not authenticated');
    const data=await response.json() as {user:{name:string}};
    introState.textContent=`欢迎回来，${data.user.name}。世界正在等待你。`;
    loggedIn=true;enter.hidden=false;
  }catch {
    introState.textContent='使用 FWERKOR 账号登录后，即可进入共享世界。';
    signin.hidden=false;
  }
}
void checkAuth();
function frame(t:number){
  const dt=Math.min(.05,(t-lastFrame)/1000);lastFrame=t;
  if(started){
    const m=input();
    const motion={x,y,z,vy,grounded,jumpHeld};
    advanceMotion(motion,m,dt);
    ({x,y,z,vy,grounded,jumpHeld}=motion);
    world.setView(x,y,z,yaw,pitch);
    heading.textContent=`${['N','NE','E','SE','S','SW','W','NW'][Math.round((((-yaw%(2*Math.PI))+(2*Math.PI))%(2*Math.PI))/(Math.PI/4))%8]} ${String(Math.round(((-yaw%(2*Math.PI))+(2*Math.PI))%(2*Math.PI)*180/Math.PI)).padStart(3,'0')}°`;
    coords.textContent=`${Math.round(x)} E · ${Math.round(z)} N`;
    if(socket?.readyState===WebSocket.OPEN && t-lastInput>50){socket.send(JSON.stringify(m));lastInput=t;}
  } else {
    // Showcase the authored downtown streets while the player is on the title screen.
    const orbit=t*.00010;
    const x0=Math.sin(orbit)*2.8,z0=-23+Math.cos(orbit)*3.5;
    const y0=groundHeight(x0,z0)+6.7;
    world.setView(x0,y0,z0,Math.sin(orbit*.8)*.10,-.12);
  }
  world.render(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
