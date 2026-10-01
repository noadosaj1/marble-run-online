import { RacePhase } from '../../shared/types';

/**
 * WAITING -> COUNTDOWN -> RACING -> FINISHED -> RESULTS -> WAITING
 * Any active phase may also fall back to WAITING (abort: everyone left).
 */
const ALLOWED: Record<RacePhase, readonly RacePhase[]> = {
  [RacePhase.WAITING]: [RacePhase.COUNTDOWN],
  [RacePhase.COUNTDOWN]: [RacePhase.RACING, RacePhase.WAITING],
  [RacePhase.RACING]: [RacePhase.FINISHED, RacePhase.WAITING],
  [RacePhase.FINISHED]: [RacePhase.RESULTS, RacePhase.WAITING],
  [RacePhase.RESULTS]: [RacePhase.WAITING],
};

export class InvalidTransitionError extends Error {
  constructor(from: RacePhase, to: RacePhase) {
    super(`Invalid phase transition ${from} -> ${to}`);
  }
}

export class RaceStateMachine {
  private current: RacePhase = RacePhase.WAITING;

  get phase(): RacePhase {
    return this.current;
  }

  is(...phases: RacePhase[]): boolean {
    return phases.includes(this.current);
  }

  can(to: RacePhase): boolean {
    return ALLOWED[this.current].includes(to);
  }

  transition(to: RacePhase): void {
    if (!this.can(to)) throw new InvalidTransitionError(this.current, to);
    this.current = to;
  }
}
