import type { DomainEvent, ThreadId, WorkspacePath } from '../domain/types';

export interface AgentPort {
  initialize(): Promise<void>;
  startThread(input: { workspace: WorkspacePath }): Promise<{ threadId: ThreadId }>;
  startTurn(input: { threadId: ThreadId; prompt: string }): Promise<{ turnId: string }>;
  steerTurn(input: { threadId: ThreadId; prompt: string }): Promise<void>;
  replyApproval(input: { approvalId: string; decision: 'approved' | 'denied' }): Promise<void>;
  onNotification(cb: (event: DomainEvent) => void): () => void;
}
