import * as THREE from 'three';
import { createAvatar, disposeAvatar } from './avatar';
import type { Appearance } from '../shared/appearance';

/** Independent lightweight preview: no extra world simulation or network connection. */
export class AvatarPreview {
  private readonly renderer:THREE.WebGLRenderer;
  private readonly scene=new THREE.Scene();
  private readonly camera=new THREE.PerspectiveCamera(35,500/290,.1,30);
  private avatar:THREE.Group|null=null;
  private key='';
  private lastFrame=0;
  constructor(canvas:HTMLCanvasElement){
    this.renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'});
    this.renderer.setSize(500,290,false);
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(0x000000,0);
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=1.2;
    this.scene.add(new THREE.HemisphereLight('#d7e8ff','#344754',2.2));
    const key=new THREE.DirectionalLight('#ffd7a3',3);
    key.position.set(-3,6,-5);this.scene.add(key);
    const rim=new THREE.DirectionalLight('#65d0e2',1.5);
    rim.position.set(2,3,4);this.scene.add(rim);
    this.camera.position.set(1.0,1.65,-3.55);
    this.camera.lookAt(0,1.06,0);
  }
  setAppearance(appearance:Appearance){
    const key=JSON.stringify(appearance);
    if(key===this.key)return;
    if(this.avatar){this.scene.remove(this.avatar);disposeAvatar(this.avatar);}
    this.avatar=createAvatar(appearance);
    this.scene.add(this.avatar);
    this.key=key;
  }
  render(t:number){
    if(t-this.lastFrame<60)return;
    this.lastFrame=t;
    if(this.avatar)this.avatar.rotation.y=Math.sin(t*.0004)*1.55;
    this.renderer.render(this.scene,this.camera);
  }
  dispose(){
    if(this.avatar){this.scene.remove(this.avatar);disposeAvatar(this.avatar);this.avatar=null;}
    this.renderer.dispose();
  }
}
