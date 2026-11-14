import type { Appearance } from './appearance.js';
export interface PlayerState {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  appearance: Appearance;
}
export interface ClientInput {
  type: 'input';
  seq: number;
  forward: number;
  strafe: number;
  yaw: number;
  sprint: boolean;
  jump: boolean;
  interact?: boolean;
}
export type ClientMessage = ClientInput | { type: 'ping'; sent: number } | { type:'appearance'; appearance:Appearance };
export type ServerMessage =
  | { type: 'welcome'; id: string; tickRate: number; players: PlayerState[] }
  | { type: 'snapshot'; players: PlayerState[]; ack: number; time: number; online: number }
  | { type: 'presence'; online: number }
  | { type: 'pong'; sent: number }
  | { type: 'error'; message: string };
