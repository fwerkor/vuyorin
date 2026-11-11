export const WORLD_LIMIT = 1968;
export const CHUNK_SIZE = 96;
export const SEA_LEVEL = 0;
export const SPAWN = { x: 18, z: 44 };
export const CITY_BASE = 3.4;

export function hash2(x: number, z: number): number {
  const v = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return v - Math.floor(v);
}
export function smoothstep(a: number, b: number, v: number): number {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
function lattice(x: number, z: number): number {
  let n = Math.imul(x, 374761393) + Math.imul(z, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
export function noise2(x: number, z: number): number {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = lattice(ix, iz) * (1 - u) + lattice(ix + 1, iz) * u;
  const b = lattice(ix, iz + 1) * (1 - u) + lattice(ix + 1, iz + 1) * u;
  return a * (1 - v) + b * v;
}
function fbm(x: number, z: number): number {
  return noise2(x, z) * .52 + noise2(x * 2.1, z * 2.1) * .28 +
    noise2(x * 4.3, z * 4.3) * .14 + noise2(x * 8.8, z * 8.8) * .06;
}
export function terrainHeight(x: number, z: number): number {
  const warpX = x + (noise2(x / 840 + 38, z / 840) - .5) * 290;
  const warpZ = z + (noise2(x / 840, z / 840 - 23) - .5) * 290;
  const broad = fbm(warpX / 460, warpZ / 460);
  const ridge = 1 - Math.abs(noise2(warpX / 310 + 16, warpZ / 310 - 8) * 2 - 1);
  const ridges = Math.pow(ridge, 2.6) * 160;
  const uplift = smoothstep(260, 1250, Math.hypot(x * .83, z + 195));
  let y = 2 + (broad - .43) * 58 + uplift * (20 + ridges + fbm(warpX / 140, warpZ / 140) * 72);
  y += (noise2(x / 35, z / 35) - .5) * 4.8 * (0.3 + uplift);
  const coastalWater = smoothstep(115, 620, z) * 62;
  y -= coastalWater;
  const cityDx = Math.max(0, Math.abs(x) - 340);
  const cityDz = Math.max(0, -560 - z, z + 60);
  const cityMask = 1 - smoothstep(0, 115, Math.hypot(cityDx, cityDz));
  const harborMask = 1 - smoothstep(100, 225, Math.hypot(x - SPAWN.x, z - SPAWN.z));
  const flat = Math.max(cityMask, harborMask);
  return y * (1 - flat) + CITY_BASE * flat;
}
export function isCity(x: number, z: number): boolean {
  return Math.abs(x) <= 336 && z >= -560 && z <= -56;
}
export function terrainBiome(x: number, z: number): 'city' | 'beach' | 'forest' | 'alpine' | 'snow' | 'seabed' {
  if (isCity(x, z) || Math.hypot(x - SPAWN.x, z - SPAWN.z) < 110) return 'city';
  const y = terrainHeight(x, z);
  if (y < -1) return 'seabed';
  if (y < 4) return 'beach';
  if (y > 175) return 'snow';
  if (y > 100) return 'alpine';
  return 'forest';
}
export function clampWorld(n: number): number {
  return Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, n));
}
export function wrapAngle(angle: number): number {
  const turn = Math.PI * 2;
  return ((angle + Math.PI) % turn + turn) % turn - Math.PI;
}
