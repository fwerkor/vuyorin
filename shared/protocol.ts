export interface PlayerState {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
}
export interface ClientInput {
  type: 'input';
  seq: number;
  forward: number;
  strafe: number;
  yaw: number;
  sprint: boolean;
  jump: boolean;
}
export type ClientMessage = ClientInput | { type: 'ping'; sent: number };
export type ServerMessage =
  | { type: 'welcome'; id: string; tickRate: number; players: PlayerState[] }
  | { type: 'snapshot'; players: PlayerState[]; ack: number; time: number; online: number }
  | { type: 'presence'; online: number }
  | { type: 'pong'; sent: number }
  | { type: 'error'; message: string };
