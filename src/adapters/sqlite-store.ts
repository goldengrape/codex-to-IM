import type { AppState, DomainEvent } from '../domain/types';
import type { PersistencePort } from '../ports/persistence';

export class InMemoryPersistenceStore implements PersistencePort {
  private snapshot: AppState | null = null;
  readonly events: DomainEvent[] = [];
  readonly audits: Array<{ topic: string; payload: Record<string, unknown> }> = [];

  async loadSnapshot(): Promise<AppState | null> {
    return this.snapshot;
  }

  async saveSnapshot(state: AppState): Promise<void> {
    this.snapshot = state;
  }

  async appendEvent(event: DomainEvent): Promise<void> {
    this.events.push(event);
  }

  async appendAudit(topic: string, payload: Record<string, unknown>): Promise<void> {
    this.audits.push({ topic, payload });
  }
}
