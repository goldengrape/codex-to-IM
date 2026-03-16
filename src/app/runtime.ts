import { next } from '../domain/reducer';
import { schedulerTick } from '../domain/scheduler';
import type { AppState, Decision, DomainEvent, Effect } from '../domain/types';
import type { AgentPort } from '../ports/agent';
import type { ClockPort } from '../ports/clock';
import type { LockPort } from '../ports/lock';
import type { PersistencePort } from '../ports/persistence';
import type { TelegramPort } from '../ports/telegram';

export interface RuntimePorts {
  telegram: TelegramPort;
  agent: AgentPort;
  persistence: PersistencePort;
  clock: ClockPort;
  lock: LockPort;
}

export class AppRuntime {
  private state: AppState;
  private readonly ports: RuntimePorts;

  constructor(initialState: AppState, ports: RuntimePorts) {
    this.state = initialState;
    this.ports = ports;
  }

  getState(): AppState {
    return this.state;
  }

  async dispatch(event: DomainEvent): Promise<Decision> {
    await this.ports.persistence.appendEvent(event);
    const decision = next(this.state, event);
    for (const emittedEvent of decision.emittedEvents) {
      await this.ports.persistence.appendEvent(emittedEvent);
    }
    this.state = decision.newState;
    await this.interpret(decision.effects);
    return decision;
  }

  async flushDueJobs(now = this.ports.clock.now()): Promise<void> {
    const dueJobs = schedulerTick(this.state, now);
    for (const jobId of dueJobs) {
      await this.dispatch({ type: 'JobDue', jobId, at: now });
    }
  }

  async start(intervalMs = 1000): Promise<() => void> {
    const offAgent = this.ports.agent.onNotification((event) => {
      void this.dispatch(event);
    });
    const offTick = this.ports.clock.onTick((now) => {
      void this.flushDueJobs(now);
    }, intervalMs);
    return () => {
      offAgent();
      offTick();
    };
  }

  private async interpret(effects: Effect[]): Promise<void> {
    for (const effect of effects) {
      switch (effect.type) {
        case 'AppendAuditLog':
          await this.ports.persistence.appendAudit(effect.topic, effect.payload);
          break;
        case 'PersistState':
          await this.ports.persistence.saveSnapshot(this.state);
          break;
        case 'SendTelegramMessage':
          await this.ports.telegram.sendMessage(effect.chatId, effect.text);
          break;
        case 'EditTelegramMessage':
          await this.ports.telegram.editMessage(effect.chatId, effect.messageId, effect.text);
          break;
        case 'SendTelegramApproval':
          await this.ports.telegram.sendApproval(effect.chatId, effect.approvalId, effect.title, effect.detail);
          break;
        case 'StartAgentThread': {
          const { threadId } = await this.ports.agent.startThread({ workspace: effect.workspace });
          await this.dispatch({
            type: 'ThreadStarted',
            chatId: effect.chatId,
            workspace: effect.workspace,
            threadId,
            at: this.ports.clock.now(),
          });
          break;
        }
        case 'StartAgentTurn': {
          const { turnId } = await this.ports.agent.startTurn({ threadId: effect.threadId, prompt: effect.prompt });
          await this.dispatch({
            type: 'TurnStarted',
            threadId: effect.threadId,
            turnId,
            at: this.ports.clock.now(),
          });
          break;
        }
        case 'SteerAgentTurn':
          await this.ports.agent.steerTurn({ threadId: effect.threadId, prompt: effect.prompt });
          break;
        case 'ReplyApprovalToAgent':
          await this.ports.agent.replyApproval({ approvalId: effect.approvalId, decision: effect.decision });
          break;
        case 'AcquireJobLock':
          await this.ports.lock.acquireJobLock(effect.jobId);
          break;
        case 'ReleaseJobLock':
          await this.ports.lock.releaseJobLock(effect.jobId);
          break;
        case 'EnsureViewMessage':
        case 'ResumeAgentThread':
        case 'UpdateJobNextRun':
          break;
        default:
          effect satisfies never;
      }
    }
  }
}
