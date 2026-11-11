import type { ClientInput } from './protocol.js';

export type InputCommand = Omit<ClientInput, 'seq'>;
export interface Position3 { x: number; y: number; z: number }

export function isMoving(input: Pick<ClientInput, 'forward' | 'strafe'>): boolean {
  return input.forward !== 0 || input.strafe !== 0;
}

/** Send a stop immediately, but do not spam identical idle input every render tick. */
export function shouldSendInput(
  current: InputCommand, previous: ClientInput | null, elapsedMs: number, urgent = false
): boolean {
  if (!previous) return true;
  const controlsChanged = current.forward !== previous.forward || current.strafe !== previous.strafe ||
    current.sprint !== previous.sprint || current.jump !== previous.jump;
  if (urgent && controlsChanged) return true;
  if (elapsedMs < 50) return false;
  if (controlsChanged || current.yaw !== previous.yaw) return true;
  if (isMoving(current) || current.jump) return true;
  return elapsedMs >= 3000;
}

/**
 * A snapshot is older than current client prediction. Never drag an idle
 * player through successive stale snapshots while the stop input is in flight.
 */
export function reconcileSelf(
  local: Position3, authoritative: Position3,
  moving: boolean, stopAcknowledged: boolean, grounded: boolean
): Position3 {
  const horizontalError = Math.hypot(authoritative.x-local.x, authoritative.z-local.z);
  if (horizontalError > 7) return {...authoritative}; // Real desync/teleport.
  if (!moving && stopAcknowledged) {
    // The server processed our neutral input. Correct once, with no long tail.
    const snap = horizontalError >= .01;
    return {
      x: snap ? authoritative.x : local.x,
      z: snap ? authoritative.z : local.z,
      y: grounded && Math.abs(authoritative.y-local.y) >= .01 ? authoritative.y : local.y
    };
  }
  // While moving (or while stop is unacknowledged), small differences are
  // expected because snapshots lag client prediction by multiple frames.
  if (moving && horizontalError > 2) {
    return {
      x: local.x + (authoritative.x-local.x)*.08,
      y: local.y,
      z: local.z + (authoritative.z-local.z)*.08
    };
  }
  return local;
}

/** Remote avatars converge exactly; repeated stationary snapshots end lerp tails. */
export function remoteBlendFactor(distance: number, dt: number, stableSnapshot: boolean): number {
  if (distance <= .015 || (stableSnapshot && distance <= .15)) return 1;
  return 1 - Math.exp(-12 * Math.max(0, dt));
}
