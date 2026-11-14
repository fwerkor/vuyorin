/** Port layout is the single source of truth for the meshes AND physics colliders. */
export type PortMaterial = 'walkway' | 'steel' | 'dark' | 'orange' | 'gold';
export interface PortShape {
  id: string;
  x: number; y: number; z: number; w: number; h: number; d: number;
  material: PortMaterial;
  solid: boolean;
}
const items: PortShape[] = [];
function add(id:string,material:PortMaterial,x:number,y:number,z:number,w:number,h:number,d:number,solid=true){
  items.push({id,material,x,y,z,w,h,d,solid});
}
// The walkway is supported by the terrain/ground-height collision; it is not a wall.
add('quay-floor','walkway',28,3.38,35,86,.28,32,false);
// City-facing rail has a genuine public egress, aligned with the downtown
// boulevard. Full-width rails previously trapped new players at the harbor.
add('quay-guard-north-left','steel',4.25,2.5,18,39.5,4,.8);
add('quay-guard-north-right','steel',50.75,2.5,18,37.5,4,.8);
add('city-gate-post-west','steel',23,8.2,18,.55,6.4,.65);
add('city-gate-post-east','steel',33,8.2,18,.55,6.4,.65);
add('city-gate-beam','steel',28,11.7,18,11,.60,.65);
add('city-gate-glow','gold',28,11.25,18,9.8,.12,.17,false);
add('quay-guard-south','steel',27,2.5,52,85,4,.8);
add('warehouse','dark',-14,7.2,17,18,7,14);
add('warehouse-roof','orange',-14,11.2,17,17,1.4,14);
for(let i=0;i<8;i++){
  const x=-5+i*9.2,z=23+(i%3)*8.6;
  const mat:PortMaterial = i%3===1?'orange':i%2?'dark':'steel';
  add('container-'+i,mat,x,4.75,z,7.3,2.5,3);
  add('container-base-'+i,'dark',x,3.51,z,7.35,.08,3.1);
  if(i%3===0)add('container-stacked-'+i,'steel',x,7.3,z,7.3,2.5,3);
}
for(const x of [62,-42]){
  for(const dz of [-7,7])add('crane-leg-'+x+'-'+dz,'steel',x,16,34+dz,1.2,26,1.2);
  add('crane-cross-'+x,'orange',x,29.3,34,3,1.2,17);
  add('crane-boom-'+x,'orange',x+9,31,34,24,1.1,1.7);
  add('crane-wire-'+x,'dark',x+17,20.5,34,.18,20,.18);
  add('crane-hook-'+x,'dark',x+17,10.5,34,3.1,.6,3.1);
}
add('beacon-tower','steel',92,14,4,6,24,6);
add('beacon-top','dark',92,27,4,7,1,7);
for(let i=0;i<10;i++){
  const x=-29+i*10;
  add('light-pole-'+i,'dark',x,8.3,52,.18,9,.18);
  add('light-head-'+i,'gold',x,12.5,52,1.2,.3,.3);
}
export const PORT_SHAPES: readonly PortShape[] = items;
