import type { AppState, DomainEvent } from '../domain/types';

export interface PersistencePort {
  loadSnapshot(): Promise<AppState | null>;
  saveSnapshot(state: AppState): Promise<void>;
  appendEvent(event: DomainEvent): Promise<void>;
  appendAudit(topic: string, payload: Record<string, unknown>): Promise<void>;
}
