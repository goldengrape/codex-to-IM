import { recoverState } from '../domain/reducer';
import { createInitialState, type AppState } from '../domain/types';
import type { AgentPort } from '../ports/agent';
import type { ClockPort } from '../ports/clock';
import type { LockPort } from '../ports/lock';
import type { PersistencePort } from '../ports/persistence';
import type { TelegramPort } from '../ports/telegram';
import { AppRuntime } from './runtime';

export interface BootstrapConfig {
  acl: AppState['acl'];
}

export async function boot(
  config: BootstrapConfig,
  ports: {
    telegram: TelegramPort;
    agent: AgentPort;
    persistence: PersistencePort;
    clock: ClockPort;
    lock: LockPort;
  },
): Promise<AppRuntime> {
  const snapshot = await ports.persistence.loadSnapshot();
  const recovered = recoverState(snapshot, ports.clock.now());
  const state = {
    ...(snapshot ? recovered : createInitialState()),
    acl: config.acl,
  };
  await ports.agent.initialize();
  await ports.persistence.saveSnapshot(state);
  return new AppRuntime(state, ports);
}
