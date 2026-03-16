import type { ISOTime } from '../domain/types';
import type { ClockPort } from '../ports/clock';

export class SystemClock implements ClockPort {
  now(): ISOTime {
    return new Date().toISOString();
  }

  onTick(cb: (now: ISOTime) => void, intervalMs: number): () => void {
    const timer = setInterval(() => cb(this.now()), intervalMs);
    return () => clearInterval(timer);
  }
}
