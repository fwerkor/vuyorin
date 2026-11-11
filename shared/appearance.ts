/** Finite, server-approved character customization options. */
export const HEAD_STYLES = {
  explorer: { name: '探索者 · 护目镜', color: '#e8b77e', trim: '#324d5a' },
  sentinel: { name: '夜巡者 · 头盔', color: '#8cb5c2', trim: '#203344' },
  wanderer: { name: '漫游者 · 兜帽', color: '#b5a5d4', trim: '#393350' }
} as const;
export const BODY_STYLES = {
  frontier: { name: '远征夹克', color: '#42616c', trim: '#edbd7d' },
  neon: { name: '霓虹机能服', color: '#343b59', trim: '#7fe0df' },
  ember: { name: '赤曜防护服', color: '#785347', trim: '#ffb07a' }
} as const;
export const PACK_STYLES = {
  rover: { name: '城市行囊', color: '#4f5964', trim: '#dbb57b' },
  expedition: { name: '野外拓展包', color: '#697858', trim: '#e5d19c' },
  reactor: { name: '曜光能源包', color: '#304554', trim: '#7ce2e0' }
} as const;

export interface Appearance {
  head: keyof typeof HEAD_STYLES;
  body: keyof typeof BODY_STYLES;
  backpack: keyof typeof PACK_STYLES;
}
export const DEFAULT_APPEARANCE: Appearance = { head:'explorer', body:'frontier', backpack:'rover' };

export function validAppearance(input: unknown): input is Appearance {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const obj=input as Record<string,unknown>;
  return Object.keys(obj).length===3 &&
    typeof obj.head==='string' && Object.hasOwn(HEAD_STYLES,obj.head) &&
    typeof obj.body==='string' && Object.hasOwn(BODY_STYLES,obj.body) &&
    typeof obj.backpack==='string' && Object.hasOwn(PACK_STYLES,obj.backpack);
}

export function safeAppearance(input: unknown): Appearance {
  return validAppearance(input) ? {head:input.head,body:input.body,backpack:input.backpack} : {...DEFAULT_APPEARANCE};
}
