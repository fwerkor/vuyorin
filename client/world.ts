import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { clampWorld, hash2, SEA_LEVEL, SPAWN, terrainHeight } from '../shared/world';
import type { PlayerState } from '../shared/protocol';
import { WorldStreamer } from './streamer';

const CHUNK = 56;
const RADIUS = 5;
const LOW = new THREE.Color('#28484b'), MID = new THREE.Color('#55715d'), HIGH = new THREE.Color('#778a75');
const GROUND_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8, metalness: .04, flatShading: false });
const TRUNK_MAT = new THREE.MeshStandardMaterial({ color: '#333f3a', roughness: .97 });
const PINE_MAT = new THREE.MeshStandardMaterial({ color: '#244f42', roughness: .97, flatShading: true });
const BARK_GEO = new THREE.CylinderGeometry(.25, .4, 4.5, 5);
const PINE_GEO = new THREE.ConeGeometry(2.4, 7.8, 6);
function fogCol(v: number): THREE.Color {
  if (v < .25) return LOW.clone().lerp(MID, .5);
  if (v < 4) return MID.clone().lerp(HIGH, Math.max(0, (v-.25)/9));
  return HIGH.clone().lerp(new THREE.Color('#9ba29b'), Math.min(1, (v - 4)/24));
}
function labelSprite(name: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 112;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(9,21,28,.65)'; ctx.fillRect(8, 14, 496, 84);
  ctx.strokeStyle = 'rgba(250,199,112,.9)'; ctx.lineWidth = 3; ctx.strokeRect(8,14,496,84);
  ctx.fillStyle = '#f4eee0'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '600 38px sans-serif'; ctx.fillText(name.slice(0, 18), 256, 54, 460);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  spr.scale.set(4.7, 1.02, 1); spr.position.y = 3.2; return spr;
}
function rng(i: number): number { return hash2(i * 17.123, i * 79.431); }
interface Avatar { mesh: THREE.Group; target: THREE.Vector3; yaw: number }
export class GameWorld {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly scene: THREE.Scene;
  private composer: EffectComposer;
  private water: THREE.Mesh;
  private waterTime: { value: number };
  private sky: Sky;
  private streamer: WorldStreamer;
  private avatars = new Map<string, Avatar>();
  private sun: THREE.DirectionalLight;
  private rain: THREE.Points;
  private rainPositions: Float32Array;
  private elapsed = 0;
  private useBloom = true;
  stats(){return this.streamer.stats();}

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false });
    this.renderer.setPixelRatio(Math.min(1.5, devicePixelRatio));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.streamer = new WorldStreamer(this.scene);
    this.scene.background = new THREE.Color('#7e9aab');
    this.scene.fog = new THREE.FogExp2('#7e98a7', .0016);
    this.camera = new THREE.PerspectiveCamera(71, innerWidth / innerHeight, .08, 3800);
    this.camera.position.set(SPAWN.x, terrainHeight(SPAWN.x, SPAWN.z) + 1.7, SPAWN.z);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(new THREE.HemisphereLight('#c1ddfc', '#293b3a', 2.5));
    this.scene.add(new THREE.AmbientLight('#9babb6', .24));
    const sun = new THREE.DirectionalLight('#ffcf9a', 3.3);
    sun.position.set(-80, 130, -180); sun.target.position.set(0, 0, 0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -140; sun.shadow.camera.right = 140;
    sun.shadow.camera.top = 140; sun.shadow.camera.bottom = -140;
    sun.shadow.camera.near = 10; sun.shadow.camera.far = 410;
    sun.shadow.bias = -.00013; sun.shadow.normalBias = .02;
    this.scene.add(sun, sun.target); this.sun = sun;
    const sky = new Sky();
    sky.scale.setScalar(3000);
    const uniforms = sky.material.uniforms;
    uniforms.turbidity.value = 9;
    uniforms.rayleigh.value = 2.1;
    uniforms.mieCoefficient.value = .008;
    uniforms.mieDirectionalG.value = .87;
    const sunDir = new THREE.Vector3(-.43, .27, -.83).normalize();
    uniforms.sunPosition.value.copy(sunDir.multiplyScalar(1200));
    this.scene.add(sky); this.sky = sky;

    const wtime = { value: 0 };
    const waterMaterial = new THREE.ShaderMaterial({
      uniforms: { time: wtime, sunDirection: { value: new THREE.Vector3(-.43,.27,-.83).normalize() }, fogColor: { value: new THREE.Color('#829da8') }, cameraPos: { value: this.camera.position } },
      vertexShader: `
        varying vec3 vWorld; varying vec2 vUv;
        void main() { vUv = uv; vec4 world = modelMatrix * vec4(position, 1.0);
          vWorld = world.xyz; gl_Position = projectionMatrix * viewMatrix * world; }`,
      fragmentShader: `
        precision highp float;
        uniform float time; uniform vec3 sunDirection; uniform vec3 fogColor; uniform vec3 cameraPos;
        varying vec3 vWorld; varying vec2 vUv;
        float wave(vec2 p) { return sin(p.x*1.27 + time*1.8)*.42 + sin(p.y*2.1-time*1.17)*.32
            + sin((p.x+p.y)*3.7+time*2.6)*.14; }
        void main() {
          vec2 p = vWorld.xz*.11; float h = wave(p);
          vec2 d = vec2(wave(p+vec2(.04,0.))-h, wave(p+vec2(0.,.04))-h);
          vec3 n = normalize(vec3(-d.x*.9,1.,-d.y*.9));
          vec3 V = normalize(cameraPos-vWorld);
          float fresnel = pow(1.0-max(dot(n,V),0.0), 4.0);
          vec3 refl = mix(vec3(.09,.21,.26),vec3(.57,.68,.72), max(0.,n.y*.55+fresnel*.65));
          float sparkle = pow(max(dot(reflect(-normalize(sunDirection),n),V), 0.), 230.);
          float foam = smoothstep(.63,.78,abs(h))*.14;
          vec3 color = mix(vec3(.025,.12,.15), refl, .48 + fresnel*.4) + vec3(1.0,.68,.38)*sparkle*2.3 + foam;
          float dist = length(cameraPos-vWorld);
          color = mix(color,fogColor,1.-exp(-dist*.0026));
          gl_FragColor = vec4(color,1.);
        }`,
      side: THREE.DoubleSide, depthWrite: true
    });
    this.waterTime = wtime;
    const water = new THREE.Mesh(new THREE.PlaneGeometry(4200,4200), waterMaterial);
    water.rotation.x = -Math.PI / 2; water.position.y = SEA_LEVEL + .025;
    water.frustumCulled = false; this.scene.add(water); this.water = water;
    this.makeHarbor();
    this.rainPositions = new Float32Array(1000*3);
    for (let i = 0; i < this.rainPositions.length; i += 3) {
      this.rainPositions[i] = (Math.random()-.5)*140;
      this.rainPositions[i+1] = Math.random()*42;
      this.rainPositions[i+2] = (Math.random()-.5)*140;
    }
    const rainG = new THREE.BufferGeometry();
    rainG.setAttribute('position',new THREE.BufferAttribute(this.rainPositions,3));
    this.rain = new THREE.Points(rainG,new THREE.PointsMaterial({ color:'#d6e5e8', size:.065, transparent:true, opacity:.23, depthWrite:false }));
    this.scene.add(this.rain);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene,this.camera));
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .27, .55, .84));
    this.composer.addPass(new OutputPass());
    window.addEventListener('resize', () => this.resize());
  }
  private makeHarbor() {
    const world = new THREE.Group();
    this.scene.add(world);
    const steel = new THREE.MeshStandardMaterial({ color:'#53656b', metalness:.6, roughness:.43 });
    const dark = new THREE.MeshStandardMaterial({ color:'#23313b', metalness:.4, roughness:.5 });
    const orange = new THREE.MeshStandardMaterial({ color:'#d39b67', metalness:.35, roughness:.42, emissive:'#422211', emissiveIntensity:.15 });
    const gold = new THREE.MeshStandardMaterial({ color:'#ffd697', emissive:'#ff9b43', emissiveIntensity:2.4 });
    const walkway = new THREE.MeshStandardMaterial({ color:'#1d3439', roughness:.24, metalness:.38 });
    const cube = new THREE.BoxGeometry(1,1,1);
    const box = (mat:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number,shadow=true):THREE.Mesh => {
      const mesh = new THREE.Mesh(cube,mat); mesh.position.set(x,y,z); mesh.scale.set(w,h,d);
      mesh.castShadow = shadow; mesh.receiveShadow = true; world.add(mesh); return mesh;
    };
    // Landmark harbor; all positions tied to common terrain platform near spawn.
    box(walkway,28,3.38,35,86,.28,32,false);
    box(steel,27,2.5,18,85,4,.8);
    box(steel,27,2.5,52,85,4,.8);
    box(dark,-14,7.2,17,18,7,14);
    box(orange,-14,11.2,17,17,1.4,14);
    for(let i=0;i<8;i++) {
      const x=-5+i*9.2, z=23+(i%3)*8.6;
      const m = i%3===1 ? orange : i%2 ? dark : steel;
      box(m,x,4.75,z,7.3,2.5,3);
      box(dark,x,3.51,z,7.35,.08,3.1);
      if(i%3===0) box(steel,x,7.3,z,7.3,2.5,3);
    }
    // Crane geometry.
    for(const x of [62,-42]) {
      for (const dz of [-7,7]) box(steel,x,16,34+dz,1.2,26,1.2);
      box(orange,x,29.3,34,3,1.2,17);
      box(orange,x+9,31.0,34,24,1.1,1.7);
      box(dark,x+17,20.5,34,.18,20,.18);
      box(dark,x+17,10.5,34,3.1,.6,3.1);
    }
    // Beacon near harbor.
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(2,3.4,24,12),steel);
    beacon.position.set(92,14,4); beacon.castShadow=true; world.add(beacon);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(3.5,3.5,1,12),dark);cap.position.set(92,27,4);world.add(cap);
    const lamp = new THREE.PointLight('#ffb96c',35,70,2); lamp.position.set(92,25.5,4);world.add(lamp);
    const lens = new THREE.Mesh(new THREE.SphereGeometry(1.35,16,12),gold);lens.position.copy(lamp.position);world.add(lens);
    for(let i=0;i<10;i++) {
      const x=-29+i*10;
      box(dark,x,8.3,52,.18,9,.18);
      box(gold,x,12.5,52,1.2,.3,.3,false);
      const point = new THREE.PointLight('#ffba68',1.6,22);point.position.set(x,12.5,52);world.add(point);
    }
  }
  syncPlayers(players:PlayerState[], selfId:string){
    const seen=new Set<string>();
    for(const p of players) {
      if(p.id===selfId)continue;
      seen.add(p.id);
      let avatar=this.avatars.get(p.id);
      if(!avatar){
        const mesh=new THREE.Group();
        const coat=new THREE.MeshStandardMaterial({color:'#385565',metalness:.47,roughness:.47});
        const visor=new THREE.MeshStandardMaterial({color:'#ffc787',metalness:.55,roughness:.18,emissive:'#945828',emissiveIntensity:.6});
        const body=new THREE.Mesh(new THREE.CapsuleGeometry(.43,.8,4,8),coat);body.position.y=1.15;mesh.add(body);
        const head=new THREE.Mesh(new THREE.SphereGeometry(.36,12,8),visor);head.position.y=2.08;mesh.add(head);
        const backpack=new THREE.Mesh(new THREE.BoxGeometry(.7,1.0,.25),coat);backpack.position.set(0,1.25,.37);mesh.add(backpack);
        mesh.add(labelSprite(p.name));
        mesh.position.set(p.x,p.y-1.7,p.z);mesh.rotation.y=p.yaw;
        this.scene.add(mesh);avatar={mesh,target:new THREE.Vector3(p.x,p.y-1.7,p.z),yaw:p.yaw};this.avatars.set(p.id,avatar);
      }
      avatar.target.set(p.x,p.y-1.7,p.z);
      avatar.yaw=p.yaw;
    }
    for(const [id,a] of this.avatars) if(!seen.has(id)){
      this.scene.remove(a.mesh);
      a.mesh.traverse(o=>{if(o instanceof THREE.Sprite){o.material.map?.dispose();o.material.dispose();}else if(o instanceof THREE.Mesh){o.geometry.dispose();(o.material as THREE.Material).dispose();}});
      this.avatars.delete(id);
    }
  }
  setView(x:number,y:number,z:number,yaw:number,pitch:number){
    this.camera.position.set(clampWorld(x),y,clampWorld(z));
    this.camera.rotation.y=yaw; this.camera.rotation.x=pitch;
  }
  render(dt:number) {
    this.elapsed+=dt; this.waterTime.value=this.elapsed;
    const x=this.camera.position.x,z=this.camera.position.z;
    this.streamer.update(x,z,performance.now());
    this.sun.position.set(x-80,130,z-180);
    this.sun.target.position.set(x,0,z);this.sun.target.updateMatrixWorld();
    this.sky.position.set(x,0,z);
    this.water.position.x=x;this.water.position.z=z;
    this.rain.position.set(x,0,z);
    const p=this.rainPositions;
    for(let i=1;i<p.length;i+=3) {p[i]-=dt*26; if(p[i]<1) p[i]+=42;}
    (this.rain.geometry.attributes.position as THREE.BufferAttribute).needsUpdate=true;
    for(const a of this.avatars.values()){
      a.mesh.position.lerp(a.target,Math.min(1,dt*12));
      let delta=(a.yaw-a.mesh.rotation.y + Math.PI*3)%(Math.PI*2)-Math.PI;
      a.mesh.rotation.y+=delta*Math.min(1,dt*10);
    }
    if(this.useBloom) this.composer.render();else this.renderer.render(this.scene,this.camera);
  }
  resize(){
    this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth,innerHeight);this.composer.setSize(innerWidth,innerHeight);
  }
}
