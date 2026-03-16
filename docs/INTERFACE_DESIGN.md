# Codex-to-Telegram MVP 接口级详细设计（React / 未来 Tauri）

> 基于《带定时任务的 Codex-to-Telegram MVP 规格 v0.1》收敛而来。
> 本文聚焦 **接口契约**，用于直接指导实现与测试。

## 1. 技术与边界

- **前端/交互壳**：React（用于本地控制面板，可选）
- **桌面打包**：Tauri（后续接入）
- **核心运行时**：单机守护进程（建议 Node.js/TypeScript）
- **协议风格**：外部输入统一转换为 `DomainEvent`，由纯函数 `next()` 产出 `Effect[]`
- **状态真源**：本地持久化存储（SQLite 或 append-only log + snapshot）

---

## 2. 目录建议（MVP）

```text
src/
  domain/
    types.ts            # 核心类型（Entity/Enum/Event/Effect）
    reducer.ts          # next(state, event) -> decision
    commands.ts         # parseCommand
    scheduler.ts        # computeNextRun, due 计算
    invariants.ts       # 不变量检查（测试辅助）
  ports/
    telegram.ts         # TelegramPort
    agent.ts            # AgentPort (Codex App Server)
    persistence.ts      # PersistencePort
    clock.ts            # ClockPort
    lock.ts             # LockPort
  adapters/
    telegram-bot.ts     # Telegram Adapter 实现
    codex-gateway.ts    # Codex Agent Gateway 实现
    sqlite-store.ts     # 持久化实现
    system-clock.ts     # 真实时间实现
  app/
    runtime.ts          # 主循环 / effect interpreter
    bootstrap.ts        # 启动与恢复
  ui/                   # React（可选）
    App.tsx
```

---

## 3. 统一类型定义（TypeScript）

## 3.1 基础类型

```ts
export type UserId = string;
export type ChatId = string;
export type ThreadId = string;
export type TurnId = string;
export type JobId = string;
export type RunId = string;
export type ApprovalId = string;
export type MessageId = string;
export type WorkspacePath = string;
export type ISOTime = string; // ISO-8601
```

## 3.2 枚举与联合

```ts
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
```

## 3.3 调度模型

```ts
export type ScheduleSpec =
  | { kind: 'one_shot'; runAt: ISOTime; timezone: string }
  | { kind: 'daily'; hour: number; minute: number; timezone: string }
  | { kind: 'weekly'; weekdays: Weekday[]; hour: number; minute: number; timezone: string }
  | { kind: 'cron_like'; expr: string; timezone: string }; // 预留
```

## 3.4 核心实体

```ts
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
```

## 3.5 系统状态

```ts
export interface AppState {
  bindings: Record<ChatId, Binding>;
  jobs: Record<JobId, Job>;
  runs: Record<RunId, Run>;
  pendingApprovals: Record<ApprovalId, PendingApproval>;

  // 幂等与恢复
  processedUpdateIds: Record<ChatId, number>; // Telegram offset
  resolvedApprovalIds: Record<ApprovalId, true>;
  activeRunByJobId: Record<JobId, RunId | null>;

  // ACL
  acl: {
    users: UserId[];
    chats: ChatId[];
    workspaces: WorkspacePath[];
    admins: UserId[];
  };

  // 审计与元信息
  lastRecoveryAt: ISOTime | null;
  version: number;
}
```

---

## 4. DomainEvent 精确定义

```ts
export type DomainEvent =
  | { type: 'TelegramTextReceived'; updateId: number; userId: UserId; chatId: ChatId; text: string; at: ISOTime }
  | { type: 'TelegramCommandReceived'; updateId: number; userId: UserId; chatId: ChatId; commandText: string; at: ISOTime }
  | { type: 'TelegramApprovalClicked'; updateId: number; userId: UserId; chatId: ChatId; approvalId: ApprovalId; decision: 'approved' | 'denied'; at: ISOTime }

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

  | { type: 'ApprovalRequested'; approvalId: ApprovalId; threadId: ThreadId; turnId: TurnId | null; title: string; detail: string; at: ISOTime }
  | { type: 'ApprovalResolved'; approvalId: ApprovalId; decision: 'approved' | 'denied' | 'expired'; at: ISOTime }

  | { type: 'TurnCompleted'; threadId: ThreadId; turnId: TurnId; status: 'completed' | 'failed' | 'cancelled' | 'timed_out'; error: string | null; at: ISOTime }

  | { type: 'TransportError'; source: 'telegram' | 'agent' | 'persistence' | 'clock'; message: string; at: ISOTime }
  | { type: 'RecoveryPerformed'; at: ISOTime; summary: string };
```

---

## 5. Effect 精确定义

```ts
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
```

---

## 6. Command 契约

## 6.1 命令 AST

```ts
export type Command =
  | { kind: 'cwd'; workspace: WorkspacePath }
  | { kind: 'status' }
  | { kind: 'reset' }
  | { kind: 'diff' }
  | { kind: 'help' }
  | { kind: 'jobs' }
  | { kind: 'job_show'; jobId: JobId }
  | { kind: 'job_pause'; jobId: JobId }
  | { kind: 'job_resume'; jobId: JobId }
  | { kind: 'job_delete'; jobId: JobId }
  | { kind: 'job_run'; jobId: JobId }
  | { kind: 'job_add_once'; runAt: string; workspace: WorkspacePath; prompt: string }
  | { kind: 'job_add_daily'; hm: string; workspace: WorkspacePath; prompt: string }
  | { kind: 'job_add_weekly'; weekdays: Weekday[]; hm: string; workspace: WorkspacePath; prompt: string }
  | { kind: 'approve'; approvalId: ApprovalId }
  | { kind: 'deny'; approvalId: ApprovalId };

export type ParseError = {
  code: 'EMPTY' | 'UNKNOWN_COMMAND' | 'INVALID_ARGUMENT' | 'INVALID_DATETIME';
  message: string;
};

export type ParseCommand = (text: string) => Command | ParseError;
```

## 6.2 行为约束

- 纯函数；同输入同输出。
- 不读取系统时间；时间语义仅做格式校验。
- 对未知命令返回 `UNKNOWN_COMMAND`，不得 silently ignore。

---

## 7. Reducer 契约

```ts
export interface Decision {
  newState: AppState;
  emittedEvents: DomainEvent[];
  effects: Effect[];
}

export type Next = (state: AppState, event: DomainEvent) => Decision;
```

## 7.1 关键不变量（必须被测试覆盖）

1. 未授权用户不能触发 Agent 相关 Effect。
2. 同一 `chatId` 最多一个 `activeTurnId`。
3. 同一 `jobId` 最多一个活动 run。
4. 同一 `approvalId` 第二次解析必须 no-op。
5. 同一 `updateId` 重放必须 no-op。

## 7.2 no-op 规范

当事件被拒绝/重复时：

- `newState === state`（结构相等）
- `emittedEvents = []`
- `effects` 仅允许审计类 effect（可选）

---

## 8. Scheduler 契约

```ts
export type ComputeNextRun = (schedule: ScheduleSpec, now: ISOTime) => ISOTime | null;

export type SchedulerTick = (state: AppState, now: ISOTime) => JobId[];
```

约束：

- `ComputeNextRun` 对周期任务返回严格大于 `now` 的时间。
- `SchedulerTick` 不产生副作用，仅返回到期 jobId。
- `paused/disabled` job 永不出现在结果中。

---

## 9. Port 定义（可替换）

## 9.1 TelegramPort

```ts
export interface TelegramPort {
  pollUpdates(offset?: number): Promise<unknown[]>;
  sendMessage(chatId: ChatId, text: string): Promise<{ messageId: MessageId }>;
  editMessage(chatId: ChatId, messageId: MessageId, text: string): Promise<void>;
  sendApproval(chatId: ChatId, approvalId: ApprovalId, title: string, detail: string): Promise<{ messageId: MessageId }>;
}
```

## 9.2 AgentPort（Codex App Server）

```ts
export interface AgentPort {
  initialize(): Promise<void>;
  startThread(input: { workspace: WorkspacePath }): Promise<{ threadId: ThreadId }>;
  startTurn(input: { threadId: ThreadId; prompt: string }): Promise<{ turnId: TurnId }>;
  steerTurn(input: { threadId: ThreadId; prompt: string }): Promise<void>;
  replyApproval(input: { approvalId: ApprovalId; decision: 'approved' | 'denied' }): Promise<void>;

  // 推送通知统一映射为 DomainEvent（由 adapter 完成）
  onNotification(cb: (event: DomainEvent) => void): () => void;
}
```

## 9.3 PersistencePort

```ts
export interface PersistencePort {
  loadSnapshot(): Promise<AppState | null>;
  saveSnapshot(state: AppState): Promise<void>;
  appendEvent(event: DomainEvent): Promise<void>;
  appendAudit(topic: string, payload: Record<string, unknown>): Promise<void>;
}
```

## 9.4 ClockPort / LockPort

```ts
export interface ClockPort {
  now(): ISOTime;
  onTick(cb: (now: ISOTime) => void, intervalMs: number): () => void;
}

export interface LockPort {
  acquireJobLock(jobId: JobId): Promise<boolean>;
  releaseJobLock(jobId: JobId): Promise<void>;
}
```

---

## 10. 恢复协议

启动流程（固定顺序）：

1. `loadSnapshot`
2. 扫描 `pendingApprovals`，过期则标记 `expired`
3. 扫描 `runs`，将 `queued/running/waiting_approval` 标记为 `failed(interrupted_by_restart)`
4. 恢复 `processedUpdateIds`
5. 发出 `RecoveryPerformed`

恢复后保证：

- 不重复消费旧 Telegram update。
- 不重复执行旧审批。
- scheduler 从持久化 `nextRunAt` 继续。

---

## 11. Tauri 适配预留

虽当前 MVP 可纯守护进程运行，但为后续 Tauri 打包预留：

- React UI 仅作为 **观察/配置面板**，不承载业务真源。
- Tauri command 只调用应用服务接口，如：
  - `get_status()`
  - `list_jobs()`
  - `pause_job(jobId)`
  - `resume_job(jobId)`
- 任何 Tauri UI 触发动作仍转换为 `DomainEvent`，走同一 reducer。

---

## 12. 最小实现清单（直接可开工）

1. 完成 `domain/types.ts`（照本文类型复制）。
2. 完成 `commands.ts` + 命令解析测试。
3. 完成 `scheduler.ts` + 时间推进测试。
4. 完成 `reducer.ts` + 核心状态机测试。
5. 完成 `adapters/telegram-bot.ts` 的事件映射测试。
6. 完成 `adapters/codex-gateway.ts` 的通知映射测试。
7. 完成 `runtime.ts` 主循环集成测试（fake ports）。

---

## 13. DoD（接口级）

满足以下即认为接口设计完成：

- 所有 `DomainEvent` / `Effect` / `Entity` 均有静态类型定义。
- 每个 Port 的输入输出与错误语义明确。
- reducer/scheduler/command parser 均可在无外部依赖下测试。
- 所有不变量有对应自动化测试。
- 可在不改 domain 层代码前提下替换 Telegram 或 Agent adapter。
