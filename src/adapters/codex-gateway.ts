import type { DomainEvent, ISOTime } from '../domain/types';

export type AgentNotification =
  | { kind: 'thread_started'; chatId: string; workspace: string; threadId: string; at?: ISOTime }
  | { kind: 'turn_started'; threadId: string; turnId: string; at?: ISOTime }
  | { kind: 'turn_steered'; threadId: string; turnId: string; at?: ISOTime }
  | { kind: 'agent_text_delta'; threadId: string; turnId: string; delta: string; at?: ISOTime }
  | { kind: 'agent_status_updated'; threadId: string; turnId: string; status: string; at?: ISOTime }
  | { kind: 'diff_updated'; threadId: string; turnId: string; diff: string; at?: ISOTime }
  | { kind: 'approval_requested'; approvalId: string; threadId: string; turnId: string | null; title: string; detail: string; at?: ISOTime }
  | { kind: 'turn_completed'; threadId: string; turnId: string; status: 'completed' | 'failed' | 'cancelled' | 'timed_out'; error: string | null; at?: ISOTime };

export function mapAgentNotificationToEvent(notification: AgentNotification, fallbackAt: ISOTime): DomainEvent {
  const at = notification.at ?? fallbackAt;
  switch (notification.kind) {
    case 'thread_started':
      return {
        type: 'ThreadStarted',
        chatId: notification.chatId,
        workspace: notification.workspace,
        threadId: notification.threadId,
        at,
      };
    case 'turn_started':
      return { type: 'TurnStarted', threadId: notification.threadId, turnId: notification.turnId, at };
    case 'turn_steered':
      return { type: 'TurnSteered', threadId: notification.threadId, turnId: notification.turnId, at };
    case 'agent_text_delta':
      return {
        type: 'AgentTextDelta',
        threadId: notification.threadId,
        turnId: notification.turnId,
        delta: notification.delta,
        at,
      };
    case 'agent_status_updated':
      return {
        type: 'AgentStatusUpdated',
        threadId: notification.threadId,
        turnId: notification.turnId,
        status: notification.status,
        at,
      };
    case 'diff_updated':
      return { type: 'DiffUpdated', threadId: notification.threadId, turnId: notification.turnId, diff: notification.diff, at };
    case 'approval_requested':
      return {
        type: 'ApprovalRequested',
        approvalId: notification.approvalId,
        threadId: notification.threadId,
        turnId: notification.turnId,
        title: notification.title,
        detail: notification.detail,
        at,
      };
    case 'turn_completed':
      return {
        type: 'TurnCompleted',
        threadId: notification.threadId,
        turnId: notification.turnId,
        status: notification.status,
        error: notification.error,
        at,
      };
  }
}
