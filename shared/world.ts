export const WORLD_LIMIT = 880;
export const SEA_LEVEL = 0;
export const SPAWN = { x: 18, z: 44 };
export function hash2(x: number, z: number): number {
  const v = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return v - Math.floor(v);
}
export function smoothstep(a: number, b: number, v: number): number {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
export function terrainHeight(x: number, z: number): number {
  const broad = Math.sin(x * .011) * Math.cos(z * .009) * 6.8
    + Math.sin(x * .027 + z * .008) * 2.8
    + Math.cos(z * .033 - x * .014) * 2.1;
  const rolling = Math.sin(x * .097) * Math.cos(z * .083) * .46
    + Math.sin(x * .211 + z * .131) * .14;
  const coast = -7 * smoothstep(80, 360, Math.abs(x + 170));
  const plain = 2.7 + broad + rolling + coast;
  const harbor = 1 - smoothstep(62, 118, Math.hypot(x - SPAWN.x, z - SPAWN.z));
  return plain * (1 - harbor) + 3.4 * harbor;
}
export function clampWorld(n: number): number {
  return Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, n));
}

// Normalize any camera rotation to the range [-PI, PI).
export function wrapAngle(angle: number): number {
  const turn = Math.PI * 2;
  return ((angle + Math.PI) % turn + turn) % turn - Math.PI;
}
