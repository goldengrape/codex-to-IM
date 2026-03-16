# 《带定时任务的 Codex-to-Telegram MVP 规格》

**版本**：0.1
**状态**：MVP 规格草案
**文档类型**：产品与系统联合规格
**输出格式**：Markdown

---

## 1. 文档目标

本文定义一个最小可行产品（MVP）：

> 允许授权用户通过 Telegram 与本机上的 Codex 交互，并支持一次性定时任务、周期性任务、审批流、结果回传、会话恢复与基本审计。

本规格以两个既有事实为前提：
一是 OpenAI 的 **Codex App Server** 是一个面向客户端集成的、双向 JSON-RPC 风格接口，典型流程是 `initialize → initialized → thread/start → turn/start`，随后持续接收通知流，并且可生成与当前 Codex 版本严格匹配的 TypeScript / JSON Schema；二是 `Claude-to-IM` 与 `Claude-to-IM-skill` 已经证明了“IM 平台 ↔ 本地守护进程 ↔ AI coding agent”的桥接模式是可工作的，其中 skill 版本已明确支持 **Codex** 与 Telegram 等 IM 平台。([OpenAI Developers][1])

---

## 2. 设计目标

### 2.1 核心目标

系统应满足以下目标：

1. 用户可通过 Telegram 私聊或授权群组控制本机 Codex。
2. 用户可创建一次性任务与周期性任务。
3. 系统在高风险操作前应具备审批能力。
4. 系统应支持守护进程重启后的恢复。
5. 系统应遵循以下方法论：

   * 公理设计
   * 契约式设计
   * 函数式编程
   * 数据导向编程
   * 奥卡姆剃刀原则

### 2.2 非目标

以下内容不属于当前 MVP：

1. 多租户 SaaS
2. 跨机器分布式调度
3. Web 管理后台
4. 复杂 IDE 可视化
5. 自动 Git 提交/Push/PR 编排
6. 自然语言无限制时间解析
7. 复杂权限策略语言

---

## 3. 编写依据与边界假设

### 3.1 外部参考

本规格参考以下外部边界，而非照搬其实现：

1. **Codex App Server**

   * 长生命周期进程
   * 线程与回合模型
   * 流式通知
   * 审批/输入回传能力
   * 版本匹配的 schema 生成能力 ([OpenAI Developers][1])

2. **Claude-to-IM / Claude-to-IM-skill**

   * IM 桥接架构
   * 会话绑定
   * 流式预览
   * 审批转发
   * 守护进程式运行方式 ([GitHub][2])

### 3.2 关键边界假设

1. 本系统将 **调度（scheduling）** 视为桥接层职责，而不是 Codex runtime 原生职责。
2. 本系统将 **Telegram** 视为控制与展示界面，而不是状态真源。
3. 本系统将 **Codex App Server** 视为执行层，而不是总控层。
4. 本系统将 **持久化存储** 视为恢复、审计和幂等的基础设施。
5. 本系统优先选择 **单机、单守护进程、低耦合、可恢复** 的结构。

---

## 4. 用户需求

## 4.1 用户画像

### 主用户

* 单个开发者
* 受信任的技术团队成员
* 希望在外出、移动端、低干扰环境下远程驱动本机 Codex

### 典型使用场景

* 在手机上让 Codex 检查项目状态
* 在指定时间执行代码分析
* 在工作日固定时间生成状态摘要
* 在收到审批请求时远程批准或拒绝

---

## 4.2 用户故事

### 即时控制

* 作为用户，我希望给 Telegram 机器人发送一句自然语言，让 Codex 在指定工作目录中执行任务。
* 作为用户，我希望查看当前任务状态、最近结果和变更摘要。

### 定时任务

* 作为用户，我希望创建一个“明天 09:00 执行”的一次性任务。
* 作为用户，我希望创建一个“每天 09:00 执行”的周期任务。
* 作为用户，我希望暂停、恢复、删除或立即触发某个任务。

### 安全与审批

* 作为用户，我希望高风险工具调用需要我在 Telegram 中明确审批。
* 作为用户，我希望只有白名单用户和白名单工作目录可用。

### 恢复与审计

* 作为用户，我希望守护进程重启后，会话与任务仍能恢复。
* 作为用户，我希望查看任务历史、运行状态与错误摘要。

---

## 4.3 功能性需求

### FR-1 身份与访问控制

系统必须只接受授权用户与授权聊天上下文的请求。

### FR-2 会话绑定

系统必须维护 `Telegram Chat ↔ Workspace ↔ Codex Thread` 的绑定关系。

### FR-3 即时执行

系统必须把 Telegram 输入转化为 Codex 会话中的一次 turn 或 steer。

### FR-4 定时调度

系统必须支持：

* 一次性任务
* 周期性任务

### FR-5 审批流

系统必须支持把高风险动作转化为 Telegram 审批事件，并将决议回传给执行层。

### FR-6 结果回传

系统必须把执行过程和最终结果回传到 Telegram。

### FR-7 持久化与恢复

系统必须在守护进程重启后恢复：

* chat 绑定
* job 定义
* pending approvals
* offsets
* 最近运行状态

### FR-8 幂等与防重

系统必须避免：

* Telegram update 重放造成重复执行
* 定时任务重复触发
* 同一审批被多次解析

---

## 4.4 非功能性需求

### NFR-1 最小复杂度

MVP 应采用最少模块数与最少运行部件。

### NFR-2 可测试性

核心逻辑必须可以在无 Telegram、无 Codex、无真实时间推进的环境中测试。

### NFR-3 可恢复性

异常退出后，系统应恢复到最近一致状态。

### NFR-4 可审计性

每次调度、执行、审批、失败都应记录事件。

### NFR-5 可替换性

IM 适配器与 Agent 执行器应可替换。

### NFR-6 安全默认值

默认策略应保守，除非显式配置。

---

## 5. 公理设计

## 5.1 功能域与设计域映射

### 功能需求（FR）与设计参数（DP）

| FR   | 描述      | DP                              |
| ---- | ------- | ------------------------------- |
| FR-1 | 身份与访问控制 | DP-1 `AuthACL`                  |
| FR-2 | 会话绑定    | DP-2 `BindingStore`             |
| FR-3 | 即时执行    | DP-3 `AgentGateway`             |
| FR-4 | 定时调度    | DP-4 `Scheduler + JobStore`     |
| FR-5 | 审批流     | DP-5 `ApprovalCoordinator`      |
| FR-6 | 结果回传    | DP-6 `Renderer + DeliveryPort`  |
| FR-7 | 持久化与恢复  | DP-7 `EventLog + SnapshotStore` |
| FR-8 | 幂等与防重   | DP-8 `Dedup + LockingPolicy`    |

---

## 5.2 独立公理分析

目标是让每个 FR 主要由一个 DP 驱动，减少耦合。

设计矩阵理想化表示：

```text
[FR] = [A][DP]

      DP1 DP2 DP3 DP4 DP5 DP6 DP7 DP8
FR1    X
FR2        X
FR3            X
FR4                X
FR5                    X
FR6                        X
FR7                            X
FR8                                X
```

现实中存在有限顺序依赖：

```text
FR1 → FR2 → FR3
FR2 → FR4
FR3 → FR5 → FR6
FR2/3/4/5 → FR7/FR8
```

这是可接受的 **上三角近似 decoupled 设计**，而不是循环耦合设计。
应明确避免以下反模式：

1. Telegram adapter 直接操作线程内部状态
2. Scheduler 直接调用 IM 渲染逻辑
3. Agent gateway 直接写业务存储
4. Approval coordinator 直接绕过 reducer 改写 session

---

## 5.3 信息公理分析

在 MVP 阶段，最小信息量方案是：

1. 单守护进程
2. 单一状态真源
3. 单一事件流
4. 薄壳副作用、厚核纯函数
5. 少量结构化命令，而非复杂自然语言 DSL

因此，本规格不引入：

* 多进程消息队列
* 独立 Web 管理面
* 分布式锁
* 外部工作流引擎
* 动态规则脚本系统

---

## 6. 总体架构

## 6.1 逻辑结构

```text
Telegram User
   ↕
Telegram Adapter
   ↕
Application Core
   ├─ AuthACL
   ├─ BindingStore
   ├─ Scheduler
   ├─ JobStore
   ├─ ApprovalCoordinator
   ├─ EventLog / SnapshotStore
   ├─ Renderer
   └─ Reducer / Effect Interpreter
   ↕
Agent Gateway
   ↕
Codex App Server
   ↕
Local Workspace
```

---

## 6.2 结构原则

### 原则 1：核心纯函数化

业务决策通过：

```text
next(state, event) -> { state', effects[] }
```

### 原则 2：副作用边界清晰

只有以下模块允许副作用：

* Telegram Adapter
* Agent Gateway
* Persistence Adapter
* Clock / Timer Adapter

### 原则 3：状态数据化

状态必须是 plain data，而非带隐藏状态的对象图。

### 原则 4：协议显式化

所有外部协议事件必须先转为领域事件，再进入 reducer。

---

## 7. 模块分析

## 7.1 `TelegramAdapter`

### 职责

* 接收 Telegram updates
* 解析用户命令与文本
* 发送/编辑/回复消息
* 发送审批按钮
* 处理 callback 决议

### 输入

* 外部 Telegram updates
* 内部 `Effect.SendTelegram*`

### 输出

* `DomainEvent.Telegram*`

### 不负责

* 线程状态
* 任务调度决策
* 审批业务规则
* 持久化策略

---

## 7.2 `AuthACL`

### 职责

* 校验用户白名单
* 校验 chat 白名单
* 校验 workspace 白名单
* 校验管理员命令权限

### 契约

* 非授权请求不得进入业务 reducer
* 所有拒绝事件必须可审计

---

## 7.3 `BindingStore`

### 职责

维护以下映射：

```text
chatId -> Binding
Binding = {
  chatId,
  workspace,
  threadId?,
  activeTurnId?,
  mode,
  lastViewMessageId?,
  createdAt,
  updatedAt
}
```

### 设计说明

绑定是系统的核心领域对象之一。
它是“聊天上下文”与“Codex 会话上下文”的桥梁。

---

## 7.4 `Scheduler`

### 职责

* 计算到期任务
* 发出 `JobDue`
* 推进下次运行时间
* 管理 job lock

### 要求

* 与真实时间解耦
* 支持注入测试时钟
* 不直接调用 AgentGateway

---

## 7.5 `JobStore`

### 职责

存储：

* Job 定义
* Run 实例
* nextRunAt
* retry metadata
* 启用/禁用状态

### 不变量

* 一个 job 同时最多一个活动 run
* run 只能从 `pending/queued` 进入 `running`

---

## 7.6 `AgentGateway`

### 职责

* 启动或连接 Codex App Server
* 协议握手
* 发起线程、回合、steer
* 接收事件流
* 将事件翻译为领域事件

### 约束

* 不做业务判断
* 不直接访问 Telegram
* 不直接变更业务状态

---

## 7.7 `ApprovalCoordinator`

### 职责

* 注册待审批项
* 生成审批消息
* 处理批准/拒绝
* 确保审批幂等

### 不变量

* 同一 `approvalId` 只能解析一次
* 已解析审批再次点击必须 no-op

---

## 7.8 `Renderer`

### 职责

将内部状态渲染为 Telegram 友好文本：

* 运行中摘要
* 流式增量文本
* diff 摘要
* 审批消息
* job 列表
* 错误说明

### 原则

* 以“少消息、高信息密度”为目标
* 优先编辑单条状态消息，而不是大量新消息

---

## 7.9 `EventLog`

### 职责

记录：

* 入站命令
* 调度触发
* Agent 生命周期
* 审批
* 错误
* 恢复事件

### 作用

* 审计
* 调试
* 回放
* 恢复

---

## 8. 数据结构

## 8.1 基础类型

```text
UserId
ChatId
ThreadId
TurnId
JobId
RunId
ApprovalId
MessageId
WorkspacePath
Timestamp
```

---

## 8.2 核心实体

### `Binding`

```text
Binding {
  chatId: ChatId
  workspace: WorkspacePath
  threadId: ThreadId?
  activeTurnId: TurnId?
  lastViewMessageId: MessageId?
  mode: BindingMode
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

### `Job`

```text
Job {
  jobId: JobId
  name: string
  chatId: ChatId
  workspace: WorkspacePath
  prompt: string
  schedule: ScheduleSpec
  enabled: boolean
  nextRunAt: Timestamp?
  lastRunAt: Timestamp?
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

### `ScheduleSpec`

```text
ScheduleSpec =
  | OneShot { runAt: Timestamp, timezone: string }
  | RecurringDaily { hour: int, minute: int, timezone: string }
  | RecurringWeekly { weekdays: Set<Weekday>, hour: int, minute: int, timezone: string }
  | CronLike { expr: string, timezone: string }   // 非 MVP 必选，可预留
```

### `Run`

```text
Run {
  runId: RunId
  jobId: JobId
  threadId: ThreadId?
  turnId: TurnId?
  status: RunStatus
  startedAt: Timestamp?
  completedAt: Timestamp?
  error: string?
  resultSummary: string?
}
```

### `PendingApproval`

```text
PendingApproval {
  approvalId: ApprovalId
  chatId: ChatId
  threadId: ThreadId
  turnId: TurnId?
  title: string
  detail: string
  status: ApprovalStatus
  createdAt: Timestamp
  resolvedAt: Timestamp?
}
```

---

## 8.3 状态枚举

### `RunStatus`

```text
pending
queued
running
waiting_approval
completed
failed
cancelled
timed_out
```

### `ApprovalStatus`

```text
pending
approved
denied
expired
```

### `BindingMode`

```text
interactive
scheduled_only
paused
```

---

## 8.4 领域事件

```text
DomainEvent =
  | TelegramTextReceived
  | TelegramCommandReceived
  | TelegramApprovalClicked
  | JobCreated
  | JobUpdated
  | JobDue
  | JobStarted
  | JobCompleted
  | JobFailed
  | ThreadStarted
  | TurnStarted
  | TurnSteered
  | AgentTextDelta
  | AgentStatusUpdated
  | DiffUpdated
  | ApprovalRequested
  | ApprovalResolved
  | TurnCompleted
  | TransportError
  | RecoveryPerformed
```

---

## 8.5 副作用

```text
Effect =
  | SendTelegramMessage
  | EditTelegramMessage
  | SendTelegramApproval
  | PersistState
  | StartAgentThread
  | ResumeAgentThread
  | StartAgentTurn
  | SteerAgentTurn
  | ReplyApprovalToAgent
  | AcquireJobLock
  | ReleaseJobLock
  | UpdateJobNextRun
  | AppendAuditLog
```

---

## 9. 命令语法

## 9.1 设计原则

1. MVP 使用**结构化命令**
2. 避免模糊自然语言解析
3. 命令必须可回显、可审计、可测试

---

## 9.2 即时命令

### 绑定工作目录

```text
/cwd <workspace>
```

### 查看状态

```text
/status
```

### 重置会话

```text
/reset
```

### 查看最近 diff 摘要

```text
/diff
```

### 帮助

```text
/help
```

---

## 9.3 定时任务命令

### 一次性任务

```text
/job add once "<YYYY-MM-DD HH:MM>" "<workspace>" "<prompt>"
```

示例：

```text
/job add once "2026-03-16 09:00" "/repo/project-a" "检查测试失败原因并总结"
```

### 每日任务

```text
/job add daily "<HH:MM>" "<workspace>" "<prompt>"
```

示例：

```text
/job add daily "09:00" "/repo/project-a" "总结仓库状态"
```

### 每周任务

```text
/job add weekly "<Mon,Wed,Fri>" "<HH:MM>" "<workspace>" "<prompt>"
```

### 查看任务

```text
/jobs
```

### 查看某任务

```text
/job show <jobId>
```

### 暂停任务

```text
/job pause <jobId>
```

### 恢复任务

```text
/job resume <jobId>
```

### 删除任务

```text
/job delete <jobId>
```

### 立即执行一次

```text
/job run <jobId>
```

---

## 9.4 审批命令

### 文本式审批（兼容无按钮场景）

```text
/approve <approvalId>
/deny <approvalId>
```

### 按钮式审批

* Allow
* Deny

---

## 10. 状态机

## 10.1 守护进程状态机

```text
booting
  -> initializing
  -> running
  -> degraded
  -> recovering
  -> running
  -> shutting_down
```

### 转移规则

* `booting -> initializing`：载入配置和持久化状态
* `initializing -> running`：Telegram 与 AgentGateway 就绪
* `running -> degraded`：某外部依赖失效但系统未崩溃
* `degraded -> recovering`：开始恢复流程
* `recovering -> running`：恢复成功

---

## 10.2 会话状态机

```text
idle
  -> thread_starting
  -> ready
  -> turn_running
  -> waiting_approval
  -> turn_running
  -> ready
```

### 异常分支

```text
turn_running -> failed -> ready
waiting_approval -> denied -> ready
```

---

## 10.3 任务状态机

```text
draft
  -> scheduled
  -> due
  -> running
  -> completed
```

### 周期任务循环

```text
scheduled -> due -> running -> scheduled
```

### 其他转移

```text
scheduled -> paused
paused -> scheduled
running -> failed
running -> waiting_approval
waiting_approval -> running
waiting_approval -> failed
```

---

## 10.4 审批状态机

```text
pending
  -> approved
  -> terminal

pending
  -> denied
  -> terminal

pending
  -> expired
  -> terminal
```

---

## 11. 契约式设计

## 11.1 全局不变量

系统必须始终满足：

1. 未授权用户不得触发执行层动作。
2. 任一 `chatId` 同时最多一个活动 turn。
3. 任一 `jobId` 同时最多一个活动 run。
4. 任一 `approvalId` 只能解析一次。
5. 任一 Telegram `updateId` 最多处理一次。
6. 任一领域状态转移必须可由事件日志解释。
7. 所有 reducer 必须为纯函数。

---

## 11.2 核心函数契约

### `parseCommand(text) -> Command | ParseError`

**前置条件**

* `text` 非空

**后置条件**

* 不产生副作用
* 对相同输入必须产生相同输出

---

### `next(state, event) -> Decision`

其中：

```text
Decision {
  newState
  emittedEvents[]
  effects[]
}
```

**前置条件**

* `event` 已通过基础结构校验

**后置条件**

* 不直接访问网络、磁盘、时间源

---

### `computeNextRun(schedule, now) -> Timestamp?`

**前置条件**

* `schedule` 合法
* `now` 带明确时区语义

**后置条件**

* 若 job 已完成且非周期性，返回 `null`
* 若为周期性任务，返回严格大于 `now` 的下一次执行时间

---

### `resolveApproval(approvalId, decision) -> Decision`

**前置条件**

* `approvalId` 存在且未决

**后置条件**

* 同一审批第二次解析必须产生 `no-op`

---

## 12. 算法说明（伪代码）

## 12.1 启动与恢复

```python
def boot(config, persisted_state, clock):
    state = recover_state(persisted_state)

    validate_acl(config.acl)
    validate_workspaces(config.allowed_workspaces)

    telegram = connect_im_adapter(config.im)
    agent = connect_agent_gateway(config.agent)

    return Runtime(
        state=state,
        telegram=telegram,
        agent=agent,
        clock=clock
    )
```

---

## 12.2 主循环

```python
def main_loop(runtime):
    while True:
        source_event = select_next(
            runtime.telegram.poll(),
            runtime.agent.read_notification(),
            runtime.clock.tick()
        )

        domain_event = translate(source_event)

        decision = next(runtime.state, domain_event)

        persist(decision.newState, decision.emittedEvents)
        runtime.state = decision.newState

        for effect in decision.effects:
            interpret(effect, runtime)
```

---

## 12.3 Telegram 输入处理

```python
def next(state, event):
    match event:

        case TelegramTextReceived(userId, chatId, text):
            if not authorized(state.acl, userId, chatId):
                return reject(state, "unauthorized")

            binding = get_or_create_binding(state, chatId)

            if binding.activeTurnId is not None:
                return Decision(
                    newState=state,
                    emittedEvents=[],
                    effects=[
                        SteerAgentTurn(
                            threadId=binding.threadId,
                            text=text
                        )
                    ]
                )

            if binding.threadId is None:
                return Decision(
                    newState=mark_chat_busy(state, chatId),
                    emittedEvents=[],
                    effects=[
                        StartAgentThread(chatId=chatId, workspace=binding.workspace),
                        SendTelegramMessage(chatId, "正在启动 Codex 会话…")
                    ]
                )

            return Decision(
                newState=mark_chat_busy(state, chatId),
                emittedEvents=[],
                effects=[
                    StartAgentTurn(binding.threadId, text),
                    EnsureViewMessage(chatId)
                ]
            )
```

---

## 12.4 定时触发

```python
def scheduler_tick(state, now):
    due_jobs = []

    for job in state.jobs:
        if not job.enabled:
            continue
        if job.nextRunAt is None:
            continue
        if job.nextRunAt <= now and not has_active_run(state, job.jobId):
            due_jobs.append(job)

    return due_jobs
```

---

## 12.5 到期任务转执行

```python
def next(state, event):
    match event:

        case JobDue(jobId):
            job = state.jobs[jobId]

            run = Run(
                runId=new_id(),
                jobId=job.jobId,
                threadId=get_binding(state, job.chatId).threadId,
                turnId=None,
                status="queued"
            )

            return Decision(
                newState=attach_run(state, run),
                emittedEvents=[JobStarted(run.runId)],
                effects=[
                    AcquireJobLock(job.jobId),
                    EnsureBinding(job.chatId, job.workspace),
                    StartAgentTurnForJob(job, run),
                    SendTelegramMessage(job.chatId, f"定时任务开始：{job.name}")
                ]
            )
```

---

## 12.6 Agent 通知翻译

```python
def translate_agent_notification(msg):
    match msg.kind:
        case "thread_started":
            return ThreadStarted(
                threadId=msg.threadId,
                workspace=msg.workspace
            )

        case "turn_started":
            return TurnStarted(
                threadId=msg.threadId,
                turnId=msg.turnId
            )

        case "agent_text_delta":
            return AgentTextDelta(
                threadId=msg.threadId,
                turnId=msg.turnId,
                delta=msg.delta
            )

        case "diff_updated":
            return DiffUpdated(
                threadId=msg.threadId,
                turnId=msg.turnId,
                diff=msg.diff
            )

        case "approval_requested":
            return ApprovalRequested(
                approvalId=msg.approvalId,
                threadId=msg.threadId,
                title=msg.title,
                detail=msg.detail
            )

        case "turn_completed":
            return TurnCompleted(
                threadId=msg.threadId,
                turnId=msg.turnId,
                status=msg.status,
                error=msg.error
            )

        case _:
            return Ignored()
```

---

## 12.7 流式渲染

```python
def next(state, event):
    match event:

        case AgentTextDelta(threadId, turnId, delta):
            view = append_delta(state.views, threadId, turnId, delta)

            return Decision(
                newState=save_view(state, view),
                emittedEvents=[],
                effects=[
                    EditTelegramMessage(
                        chatId=view.chatId,
                        messageId=view.messageId,
                        text=render_live_view(view)
                    )
                ]
            )
```

---

## 12.8 审批流

```python
def next(state, event):
    match event:

        case ApprovalRequested(approvalId, threadId, title, detail):
            approval = PendingApproval(
                approvalId=approvalId,
                chatId=find_chat_by_thread(state, threadId),
                threadId=threadId,
                title=title,
                detail=detail,
                status="pending"
            )

            return Decision(
                newState=store_pending_approval(state, approval),
                emittedEvents=[],
                effects=[
                    SendTelegramApproval(
                        approval.chatId,
                        approval.approvalId,
                        approval.title,
                        approval.detail
                    )
                ]
            )

        case TelegramApprovalClicked(chatId, approvalId, decision):
            approval = get_pending_approval(state, approvalId)
            if approval is None:
                return no_op(state)
            if approval.status != "pending":
                return no_op(state)

            return Decision(
                newState=resolve_approval_state(state, approvalId, decision),
                emittedEvents=[ApprovalResolved(approvalId, decision)],
                effects=[
                    ReplyApprovalToAgent(approvalId, decision),
                    EditTelegramMessage(
                        chatId=chatId,
                        messageId=find_approval_message(state, approvalId),
                        text=render_approval_result(approvalId, decision)
                    )
                ]
            )
```

---

## 12.9 周期任务推进

```python
def finalize_run(state, run, result, now):
    job = state.jobs[run.jobId]

    if is_one_shot(job.schedule):
        next_run = None
        enabled = False
    else:
        next_run = compute_next_run(job.schedule, now)
        enabled = True

    state = mark_run_completed(state, run.runId, result, now)
    state = update_job_schedule_state(state, job.jobId, next_run, enabled)

    return state
```

---

## 12.10 重启恢复

```python
def recover_state(snapshot):
    state = load_snapshot(snapshot)

    for approval in state.pending_approvals:
        if approval.status == "pending" and is_expired(approval):
            state = expire_approval(state, approval.approvalId)

    for run in state.runs:
        if run.status in ["queued", "running", "waiting_approval"]:
            state = mark_run_failed(state, run.runId, "interrupted_by_restart")

    return state
```

---

## 13. TDD 规格

## 13.1 TDD 总原则

采用 **测试先行**：

1. 先写领域测试，再写适配器实现
2. 先测 reducer，再测 side effects
3. 先测状态转移，再测外部协议转换
4. 所有 bug 修复必须先写回归测试

---

## 13.2 测试分层

### A. 纯领域单元测试

测试对象：

* `parseCommand`
* `computeNextRun`
* `next(state, event)`
* `render_*`

特点：

* 无网络
* 无磁盘
* 无真实时间
* 无真实 Telegram/Codex

### B. 端口契约测试

测试对象：

* TelegramAdapter 输出的 `DomainEvent`
* AgentGateway 输入输出映射
* PersistenceAdapter 行为契约

特点：

* 使用 mock/fake
* 验证协议与边界

### C. 应用级集成测试

测试对象：

* 主循环
* 恢复流程
* 调度→执行→审批→完成全链路

### D. 回归测试

测试对象：

* 幂等
* 重放
* 重启
* 多次点击审批
* 重复到期任务

---

## 13.3 最小测试清单

### 命令解析

* 能解析 `/job add once`
* 能拒绝格式错误时间
* 能拒绝未知命令

### ACL

* 未授权用户被拒绝
* 授权用户可进入 reducer

### 绑定

* 新 chat 自动创建 binding
* `/cwd` 能更新 binding.workspace
* `/reset` 清空 thread 关联

### 定时任务

* 创建 one-shot 后有 `nextRunAt`
* 到期 job 仅触发一次
* paused job 不触发
* recurring job 完成后推进下一次执行

### 执行

* 无 thread 时先启动 thread 再 start turn
* 有活动 turn 时文本变为 steer
* 任务完成后 activeTurn 清空

### 审批

* 审批请求可进入 pending
* 批准后发送回传 effect
* 同一审批二次点击 no-op

### 恢复

* pending approval 可恢复
* interrupted run 在重启后转 failed
* offsets 恢复后不会重复消费

---

## 13.4 示例测试用例

### 用例：一次性任务触发后只执行一次

```python
def test_one_shot_job_runs_once():
    state = given_state_with_job(
        jobId="J1",
        schedule=OneShot(runAt="2026-03-16T09:00:00"),
        enabled=True
    )

    due1 = scheduler_tick(state, now="2026-03-16T09:00:00")
    assert due1 == ["J1"]

    state = apply_event(state, JobDue("J1"))
    state = mark_run_running(state, "R1")

    due2 = scheduler_tick(state, now="2026-03-16T09:00:01")
    assert due2 == []

    state = finalize_run(state, run="R1", result="ok", now="2026-03-16T09:01:00")

    due3 = scheduler_tick(state, now="2026-03-16T10:00:00")
    assert due3 == []
```

### 用例：审批重复点击不应重复执行

```python
def test_approval_is_idempotent():
    state = given_pending_approval("A1")

    d1 = next(state, TelegramApprovalClicked(chatId="C1", approvalId="A1", decision="approved"))
    state = d1.newState

    d2 = next(state, TelegramApprovalClicked(chatId="C1", approvalId="A1", decision="approved"))

    assert contains_effect(d1.effects, ReplyApprovalToAgent("A1", "approved"))
    assert d2.effects == []
```

---

## 14. MVP 验收标准

系统达到 MVP 的标准：

1. 授权用户能在 Telegram 中绑定一个工作目录。
2. 用户能发送自然语言请求并得到 Codex 回应。
3. 用户能创建 one-shot job。
4. 用户能创建 daily recurring job。
5. 到期任务会自动触发执行。
6. 高风险行为会进入审批流。
7. 审批结果会回传并改变执行状态。
8. 守护进程重启后 job、binding、pending approval 可恢复。
9. Telegram update 重放不会导致重复执行。
10. 所有核心 reducer 与 scheduler 逻辑都有自动化测试。

---

## 15. 简化决策与奥卡姆剃刀落地

### 保留

* 单守护进程
* 单状态机核心
* 单事件总线
* 结构化命令
* 小而明确的数据模型

### 删除

* 模糊 NLP 时间解析
* 多 IM 同时支持
* 分布式 worker
* 图形化后台
* 复杂脚本语言
* 多层缓存

### 原则总结

> 能用一个明确命令解决，就不引入复杂解析器；
> 能用一个纯函数 reducer 解决，就不引入对象图与回调链；
> 能用一个本地状态真源解决，就不引入多处隐式状态。

---

## 16. 后续扩展点（非 MVP）

1. 条件轮询任务
2. richer diff 视图
3. 文件附件回传
4. 任务模板
5. 多 workspace profile
6. 更丰富的审批策略
7. 群聊多用户角色模型
8. 兼容其他 IM 平台
9. 兼容其他 agent runtime

---

## 17. 总结

本规格将系统明确分为四层：

1. **Telegram 交互层**
2. **调度与业务核心层**
3. **Codex 执行层**
4. **持久化与恢复层**

MVP 的关键不是“支持很多功能”，而是保证以下五件事同时成立：

* 可远程控制
* 可定时执行
* 可审批
* 可恢复
* 可测试

在设计方法上，本规格贯彻了：

* **公理设计**：FR/DP 明确映射，避免循环耦合
* **契约式设计**：前置条件、后置条件、不变量清晰
* **函数式编程**：核心 reducer 纯函数化
* **数据导向编程**：状态为数据、事件为数据、effect 为数据
* **奥卡姆剃刀**：最小模块数、最少基础设施、最少协议假设

---

如果你要继续下一步，最合适的是把这份规格收敛成一份 **“接口级详细设计”**，直接列出：
`DomainEvent`、`Effect`、`Job`、`Binding`、`Approval`、`Port` 的精确定义。

[1]: https://developers.openai.com/codex/app-server/ "Codex App Server"
[2]: https://github.com/op7418/Claude-to-IM-skill "GitHub - op7418/Claude-to-IM-skill: Bridge Claude Code / Codex to IM platforms — chat with AI coding agents from Telegram, Discord, or Feishu/Lark. · GitHub"
