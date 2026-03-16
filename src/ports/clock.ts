import type { ISOTime } from '../domain/types';

export interface ClockPort {
  now(): ISOTime;
  onTick(cb: (now: ISOTime) => void, intervalMs: number): () => void;
}
