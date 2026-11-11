import './style.css';
import { GameWorld } from './world';
import { SPAWN, wrapAngle } from '../shared/world';
import { PhysicsRuntime, groundHeight } from '../shared/physics';
import { DEFAULT_APPEARANCE, HEAD_STYLES, BODY_STYLES, PACK_STYLES, safeAppearance, type Appearance } from '../shared/appearance';
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
const cross=document.getElementById('center-cross')!;
const wardrobe=document.getElementById('wardrobe')!;
let physics:PhysicsRuntime | null=null;
let physicsLoading:Promise<PhysicsRuntime>|null=null;
let loggedIn=false, started=false, selfId='', socket:WebSocket|null=null, seq=0;
let accountId='',appearance:Appearance={...DEFAULT_APPEARANCE};
let yaw=0, pitch=-.035, x=SPAWN.x, z=SPAWN.z, y=groundHeight(x,z)+1.7, vy=0, grounded=true, jumpHeld=false;
let lastFrame=performance.now(), lastInput=0;
const held=new Set<string>();
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
function showToast(text:string){toast.textContent=text;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),3000);}
function renderWardrobe(){
  const preview=wardrobe.querySelector('.preview-character') as HTMLElement;
  for(const [name,color] of Object.entries({head:HEAD_STYLES[appearance.head].color,body:BODY_STYLES[appearance.body].color,pack:PACK_STYLES[appearance.backpack].color,
    'head-trim':HEAD_STYLES[appearance.head].trim,'body-trim':BODY_STYLES[appearance.body].trim,'pack-trim':PACK_STYLES[appearance.backpack].trim})){
    preview.style.setProperty('--'+name,color);
  }
  const groups=[
    {part:'head',element:'headOptions',styles:HEAD_STYLES},
    {part:'body',element:'bodyOptions',styles:BODY_STYLES},
    {part:'backpack',element:'backpackOptions',styles:PACK_STYLES}
  ] as const;
  for(const group of groups){
    const container=document.getElementById(group.element)!;
    container.replaceChildren();
    for(const [key,style] of Object.entries(group.styles)){
      const option=document.createElement('button');
      option.type='button';option.className='wardrobe-option';
      option.setAttribute('aria-pressed',String(appearance[group.part]===key));
      option.setAttribute('aria-label',`${group.part}: ${style.name}`);
      const swatch=document.createElement('span');swatch.className='wardrobe-swatch';
      swatch.style.setProperty('--swatch',style.color);swatch.style.setProperty('--trim',style.trim);
      option.append(swatch,document.createTextNode(style.name));
      option.onclick=()=>{
        appearance=safeAppearance({...appearance,[group.part]:key});
        try{localStorage.setItem('vuyorin:appearance:'+accountId,JSON.stringify(appearance));}catch{/* Private browsing */}
        renderWardrobe();
      };
      container.append(option);
    }
  }
}
function connect(){
  if(socket && socket.readyState<=WebSocket.OPEN)return;
  const protocol=location.protocol==='https:'?'wss:':'ws:';
  const connection=socket=new WebSocket(`${protocol}//${location.host}/ws`);
  status.textContent='正在连接共享世界';
  connection.addEventListener('open',()=>{
    if(socket!==connection)return;
    connection.send(JSON.stringify({type:'appearance',appearance}));
    status.textContent='已连接 · 世界在线';status.classList.add('live');showToast('欢迎来到雾曜纪');
  });
  connection.addEventListener('message',(evt)=>{
    if(socket!==connection)return;
    let msg:ServerMessage;try{msg=JSON.parse(evt.data);}catch{return;}
    if(msg.type==='welcome'){
      selfId=msg.id;world.syncPlayers(msg.players,selfId);
      physics?.syncRemoteActors(msg.players.filter(p=>p.id!==selfId));
    }
    else if(msg.type==='snapshot') {
      online.textContent=String(msg.online);
      const self=msg.players.find(p=>p.id===selfId);
      if(self){
        const d=Math.hypot(self.x-x,self.z-z);
        if(d>7){x=self.x;z=self.z;y=self.y;}
        else {x+=(self.x-x)*.055;z+=(self.z-z)*.055;y+=(self.y-y)*.07;}
      }
      world.syncPlayers(msg.players,selfId);
      physics?.syncRemoteActors(msg.players.filter(p=>p.id!==selfId));
    }
  });
  connection.addEventListener('close',event=>{
    if(socket!==connection)return;
    socket=null;selfId='';world.syncPlayers([],selfId);physics?.syncRemoteActors([]);
    online.textContent='0';status.classList.remove('live');
    if(event.code===4009){
      started=false;held.clear();intro.classList.remove('hidden');hint.classList.remove('visible');
      introState.textContent='该账号已在另一窗口进入游戏。重新进入将接管另一窗口的角色。';
      enter.textContent='重新进入世界';
      if(document.pointerLockElement===canvas)document.exitPointerLock?.();
      status.textContent='账号在其他窗口进入';
      return;
    }
    status.textContent='连接中断 · 正在重连';
    if(started && loggedIn)setTimeout(connect,2200);
  });
  connection.addEventListener('error',()=>{if(socket===connection)status.textContent='服务器连接异常';});
}
function input():ClientInput {
  return {type:'input',seq:++seq,
    forward:Number(held.has('KeyW')||held.has('ArrowUp'))-Number(held.has('KeyS')||held.has('ArrowDown')),
    strafe:Number(held.has('KeyD')||held.has('ArrowRight'))-Number(held.has('KeyA')||held.has('ArrowLeft')),
    yaw, sprint:held.has('ShiftLeft')||held.has('ShiftRight'),jump:held.has('Space')};
}
async function start(){
  if(!loggedIn)return;
  if(started)return;
  enter.disabled=true;
  introState.textContent='正在启动共享物理世界...';
  try {
    physics=await (physicsLoading??=PhysicsRuntime.create());
  } catch(error) {
    physicsLoading=null;
    console.error('Physics init failed',error);
    introState.textContent='物理引擎启动失败，请重试。';
    showToast('物理引擎初始化失败，请刷新');enter.disabled=false;return;
  }
  enter.disabled=false;
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
    const data=await response.json() as {user:{id:string;name:string}};
    accountId=data.user.id;
    try{appearance=safeAppearance(JSON.parse(localStorage.getItem('vuyorin:appearance:'+accountId)||'null'));}catch{appearance={...DEFAULT_APPEARANCE};}
    wardrobe.hidden=false;renderWardrobe();
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
    physics!.updateScenery([{x,z}]);
    physics!.move('local',motion,m,dt);
    ({x,y,z,vy,grounded,jumpHeld}=motion);
    world.setView(x,y,z,yaw,pitch);
    cross.classList.toggle('visible',world.hasInteractionTarget(x,y,z));
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
