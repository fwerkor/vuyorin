import { CITY_BUILDINGS } from './city-layout.v1.js';
import { CHUNK_SIZE, CITY_BASE, hash2, isCity, terrainBiome, terrainHeight } from './world.js';

export const CITY_GRID = 56;
export interface Building {
  id: string; x: number; z: number; w: number; d: number; h: number;
  style: number; floors: number; seed: number;
}
export interface ScenicTree { x: number; y: number; z: number; scale: number; kind: number }
export interface ScenicRock { x: number; y: number; z: number; scale: number; spin: number }
export interface Obstacle { x: number; z: number; w: number; d: number; minY: number; maxY: number }

export const BUILDINGS: readonly Building[] = CITY_BUILDINGS;

export const PORT_OBSTACLES: readonly Obstacle[] = [
  {x: -14, z:17,w:18,d:14,minY:3.4,maxY:12},
  {x: 92,z:4,w:6,d:6,minY:3.4,maxY:29},
  ...Array.from({length:8},(_,i)=>({
    x: -5+i*9.2, z:23+(i%3)*8.6, w:7.3,d:3,
    minY:3.4,maxY: i%3===0 ? 8.55 : 6.1
  }))
];

export function buildingsForChunk(cx: number, cz: number): Building[] {
  const x = cx * CHUNK_SIZE, z = cz * CHUNK_SIZE;
  const half = CHUNK_SIZE / 2;
  return BUILDINGS.filter(b => Math.abs(b.x - x) < half && Math.abs(b.z - z) < half);
}
export function nearbyObstacles(x: number, z: number, distance = 18): Obstacle[] {
  const result = PORT_OBSTACLES.filter(b => Math.abs(b.x - x) < b.w / 2 + distance && Math.abs(b.z - z) < b.d / 2 + distance);
  for (const b of BUILDINGS) {
    if (Math.abs(b.x - x) < b.w / 2 + distance && Math.abs(b.z - z) < b.d / 2 + distance) {
      result.push({x:b.x,z:b.z,w:b.w,d:b.d,minY:CITY_BASE-.05,maxY:CITY_BASE+b.h});
    }
  }
  return result;
}
const sceneryCache = new Map<string, { trees: ScenicTree[]; rocks: ScenicRock[] }>();
export function sceneryForChunk(cx: number, cz: number): { trees: ScenicTree[]; rocks: ScenicRock[] } {
  const key = cx + ':' + cz;
  const cached = sceneryCache.get(key);
  if (cached) return cached;
  const trees: ScenicTree[] = [], rocks: ScenicRock[] = [];
  const x0 = cx * CHUNK_SIZE, z0 = cz * CHUNK_SIZE;
  for (let i = 0; i < 36; i++) {
    const x = x0 + (hash2(cx * 97 + i * 23, cz * 23 + i * 17) - .5) * CHUNK_SIZE;
    const z = z0 + (hash2(cx * 31 + i * 47, cz * 67 + i * 11) - .5) * CHUNK_SIZE;
    const biome = terrainBiome(x, z);
    const r = hash2(cx * 87 + i * 11, cz * 91 - i * 3);
    const y = terrainHeight(x, z);
    if (biome === 'forest' && r > .13 && !isCity(x,z))
      trees.push({x,y,z,scale:.6+hash2(x*.3,z*.3)*1.35,kind:r>.45?0:1});
    if ((biome==='alpine'||biome==='forest'||biome==='beach') && r < .25)
      rocks.push({x,y,z,scale:.65+hash2(x*.7,z*.7)*2.2,spin:hash2(x,z)*6.283});
  }
  const result = {trees,rocks};
  sceneryCache.set(key, result);
  // Keep generation bounded during long-distance exploration.
  if (sceneryCache.size > 256) sceneryCache.delete(sceneryCache.keys().next().value!);
  return result;
}
