export type UserId = string;
export type ChatId = string;
export type ThreadId = string;
export type TurnId = string;
export type JobId = string;
export type RunId = string;
export type ApprovalId = string;
export type MessageId = string;
export type WorkspacePath = string;
export type ISOTime = string;

export type BindingMode = 'interactive' | 'scheduled_only' | 'paused';

export type RunStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'waiting_approval'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timed_out';

export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'expired';

export type Weekday = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

export type ScheduleSpec =
  | { kind: 'one_shot'; runAt: ISOTime; timezone: string }
  | { kind: 'daily'; hour: number; minute: number; timezone: string }
  | { kind: 'weekly'; weekdays: Weekday[]; hour: number; minute: number; timezone: string }
  | { kind: 'cron_like'; expr: string; timezone: string };

export interface Binding {
  chatId: ChatId;
  workspace: WorkspacePath;
  threadId: ThreadId | null;
  activeTurnId: TurnId | null;
  lastViewMessageId: MessageId | null;
  mode: BindingMode;
  createdAt: ISOTime;
  updatedAt: ISOTime;
}

export interface Job {
  jobId: JobId;
  name: string;
  chatId: ChatId;
  workspace: WorkspacePath;
  prompt: string;
  schedule: ScheduleSpec;
  enabled: boolean;
  nextRunAt: ISOTime | null;
  lastRunAt: ISOTime | null;
  createdAt: ISOTime;
  updatedAt: ISOTime;
}

export interface Run {
  runId: RunId;
  jobId: JobId;
  threadId: ThreadId | null;
  turnId: TurnId | null;
  status: RunStatus;
  startedAt: ISOTime | null;
  completedAt: ISOTime | null;
  error: string | null;
  resultSummary: string | null;
}

export interface PendingApproval {
  approvalId: ApprovalId;
  chatId: ChatId;
  threadId: ThreadId;
  turnId: TurnId | null;
  title: string;
  detail: string;
  status: ApprovalStatus;
  createdAt: ISOTime;
  resolvedAt: ISOTime | null;
  messageId: MessageId | null;
}

export interface PendingInput {
  kind: 'interactive' | 'job';
  chatId: ChatId;
  workspace: WorkspacePath;
  prompt: string;
  createdAt: ISOTime;
  jobId: JobId | null;
  runId: RunId | null;
}

export interface LiveView {
  chatId: ChatId;
  threadId: ThreadId;
  turnId: TurnId | null;
  text: string;
  diff: string | null;
  updatedAt: ISOTime;
}

export interface AppState {
  bindings: Record<ChatId, Binding>;
  jobs: Record<JobId, Job>;
  runs: Record<RunId, Run>;
  pendingApprovals: Record<ApprovalId, PendingApproval>;
  processedUpdateIds: Record<ChatId, number>;
  resolvedApprovalIds: Record<ApprovalId, true>;
  activeRunByJobId: Record<JobId, RunId | null>;
  acl: {
    users: UserId[];
    chats: ChatId[];
    workspaces: WorkspacePath[];
    admins: UserId[];
  };
  lastRecoveryAt: ISOTime | null;
  version: number;
  pendingInputsByChatId: Record<ChatId, PendingInput | undefined>;
  liveViewsByThreadId: Record<ThreadId, LiveView | undefined>;
}

export type DomainEvent =
  | { type: 'TelegramTextReceived'; updateId: number; userId: UserId; chatId: ChatId; text: string; at: ISOTime }
  | { type: 'TelegramCommandReceived'; updateId: number; userId: UserId; chatId: ChatId; commandText: string; at: ISOTime }
  | {
      type: 'TelegramApprovalClicked';
      updateId: number;
      userId: UserId;
      chatId: ChatId;
      approvalId: ApprovalId;
      decision: 'approved' | 'denied';
      at: ISOTime;
    }
  | { type: 'JobCreated'; jobId: JobId; at: ISOTime }
  | { type: 'JobUpdated'; jobId: JobId; at: ISOTime }
  | { type: 'JobDue'; jobId: JobId; at: ISOTime }
  | { type: 'JobStarted'; runId: RunId; jobId: JobId; at: ISOTime }
  | { type: 'JobCompleted'; runId: RunId; jobId: JobId; at: ISOTime }
  | { type: 'JobFailed'; runId: RunId; jobId: JobId; error: string; at: ISOTime }
  | { type: 'ThreadStarted'; chatId: ChatId; workspace: WorkspacePath; threadId: ThreadId; at: ISOTime }
  | { type: 'TurnStarted'; threadId: ThreadId; turnId: TurnId; at: ISOTime }
  | { type: 'TurnSteered'; threadId: ThreadId; turnId: TurnId; at: ISOTime }
  | { type: 'AgentTextDelta'; threadId: ThreadId; turnId: TurnId; delta: string; at: ISOTime }
  | { type: 'AgentStatusUpdated'; threadId: ThreadId; turnId: TurnId; status: string; at: ISOTime }
  | { type: 'DiffUpdated'; threadId: ThreadId; turnId: TurnId; diff: string; at: ISOTime }
  | {
      type: 'ApprovalRequested';
      approvalId: ApprovalId;
      threadId: ThreadId;
      turnId: TurnId | null;
      title: string;
      detail: string;
      at: ISOTime;
    }
  | { type: 'ApprovalResolved'; approvalId: ApprovalId; decision: 'approved' | 'denied' | 'expired'; at: ISOTime }
  | {
      type: 'TurnCompleted';
      threadId: ThreadId;
      turnId: TurnId;
      status: 'completed' | 'failed' | 'cancelled' | 'timed_out';
      error: string | null;
      at: ISOTime;
    }
  | { type: 'TransportError'; source: 'telegram' | 'agent' | 'persistence' | 'clock'; message: string; at: ISOTime }
  | { type: 'RecoveryPerformed'; at: ISOTime; summary: string };

export type Effect =
  | { type: 'SendTelegramMessage'; chatId: ChatId; text: string }
  | { type: 'EditTelegramMessage'; chatId: ChatId; messageId: MessageId; text: string }
  | { type: 'SendTelegramApproval'; chatId: ChatId; approvalId: ApprovalId; title: string; detail: string }
  | { type: 'PersistState'; reason: string }
  | { type: 'AppendAuditLog'; topic: string; payload: Record<string, unknown> }
  | { type: 'StartAgentThread'; chatId: ChatId; workspace: WorkspacePath }
  | { type: 'ResumeAgentThread'; chatId: ChatId; threadId: ThreadId }
  | { type: 'StartAgentTurn'; threadId: ThreadId; prompt: string }
  | { type: 'SteerAgentTurn'; threadId: ThreadId; prompt: string }
  | { type: 'ReplyApprovalToAgent'; approvalId: ApprovalId; decision: 'approved' | 'denied' }
  | { type: 'AcquireJobLock'; jobId: JobId }
  | { type: 'ReleaseJobLock'; jobId: JobId }
  | { type: 'UpdateJobNextRun'; jobId: JobId; nextRunAt: ISOTime | null }
  | { type: 'EnsureViewMessage'; chatId: ChatId };

export interface Decision {
  newState: AppState;
  emittedEvents: DomainEvent[];
  effects: Effect[];
}

export const DEFAULT_TIMEZONE = 'UTC';
export const APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;

export function createInitialState(overrides: Partial<AppState> = {}): AppState {
  return {
    bindings: {},
    jobs: {},
    runs: {},
    pendingApprovals: {},
    processedUpdateIds: {},
    resolvedApprovalIds: {},
    activeRunByJobId: {},
    acl: {
      users: [],
      chats: [],
      workspaces: [],
      admins: [],
      ...overrides.acl,
    },
    lastRecoveryAt: null,
    version: 1,
    pendingInputsByChatId: {},
    liveViewsByThreadId: {},
    ...overrides,
  };
}
