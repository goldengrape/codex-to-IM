import { parseCommand, type Command, type ParseError } from './commands';
import { computeNextRun, parseHourMinute, toScheduledIsoFromLocalDateTime } from './scheduler';
import {
  createInitialState,
  DEFAULT_TIMEZONE,
  type AppState,
  type ApprovalId,
  type Binding,
  type ChatId,
  type Decision,
  type DomainEvent,
  type Effect,
  type ISOTime,
  type Job,
  type PendingApproval,
  type Run,
  type RunStatus,
  type ScheduleSpec,
  type ThreadId,
} from './types';

export function next(state: AppState, event: DomainEvent): Decision {
  switch (event.type) {
    case 'TelegramTextReceived':
      return handleTelegramText(state, event);
    case 'TelegramCommandReceived':
      return handleTelegramCommand(state, event);
    case 'TelegramApprovalClicked':
      return handleApprovalClick(state, event);
    case 'ThreadStarted':
      return handleThreadStarted(state, event);
    case 'TurnStarted':
      return handleTurnStarted(state, event);
    case 'TurnSteered':
      return withAudit(state, 'turn_steered', event, []);
    case 'AgentTextDelta':
      return handleAgentTextDelta(state, event);
    case 'AgentStatusUpdated':
      return withAudit(state, 'agent_status_updated', event, []);
    case 'DiffUpdated':
      return handleDiffUpdated(state, event);
    case 'ApprovalRequested':
      return handleApprovalRequested(state, event);
    case 'ApprovalResolved':
      return withAudit(state, 'approval_resolved', event, []);
    case 'TurnCompleted':
      return handleTurnCompleted(state, event);
    case 'JobDue':
      return handleJobDue(state, event.jobId, event.at, 'scheduled');
    case 'JobCreated':
    case 'JobUpdated':
    case 'JobStarted':
    case 'JobCompleted':
    case 'JobFailed':
    case 'TransportError':
    case 'RecoveryPerformed':
      return withAudit(state, event.type, event, []);
    default:
      return noOp(state);
  }
}

function handleTelegramText(
  state: AppState,
  event: Extract<DomainEvent, { type: 'TelegramTextReceived' }>,
): Decision {
  if (isDuplicateUpdate(state, event.chatId, event.updateId)) {
    return noOp(state);
  }

  let nextState = markProcessedUpdate(state, event.chatId, event.updateId);

  if (!isAuthorized(nextState, event.userId, event.chatId)) {
    return withAudit(
      nextState,
      'telegram_unauthorized',
      event,
      [sendMessage(event.chatId, '未授权的用户或会话，已拒绝此次请求。'), persist('unauthorized_text')],
    );
  }

  const binding = ensureBinding(nextState, event.chatId, event.at);
  nextState = binding.state;

  if (!binding.binding.workspace) {
    return withAudit(
      nextState,
      'telegram_missing_workspace',
      event,
      [sendMessage(event.chatId, '请先使用 /cwd <workspace> 绑定工作目录。'), persist('missing_workspace')],
    );
  }

  if (binding.binding.mode === 'paused') {
    return withAudit(
      nextState,
      'telegram_binding_paused',
      event,
      [sendMessage(event.chatId, '当前会话已暂停，恢复后才能继续执行。'), persist('binding_paused')],
    );
  }

  if (binding.binding.activeTurnId && binding.binding.threadId) {
    return withAudit(
      nextState,
      'telegram_text_steer',
      event,
      [
        { type: 'SteerAgentTurn', threadId: binding.binding.threadId, prompt: event.text },
        persist('interactive_steer'),
      ],
    );
  }

  if (!binding.binding.threadId) {
    const newState = {
      ...nextState,
      pendingInputsByChatId: {
        ...nextState.pendingInputsByChatId,
        [event.chatId]: {
          kind: 'interactive' as const,
          chatId: event.chatId,
          workspace: binding.binding.workspace,
          prompt: event.text,
          createdAt: event.at,
          jobId: null,
          runId: null,
        },
      },
    };

    return withAudit(
      newState,
      'telegram_text_start_thread',
      event,
      [
        { type: 'StartAgentThread', chatId: event.chatId, workspace: binding.binding.workspace },
        sendMessage(event.chatId, '正在启动 Codex 会话…'),
        persist('start_thread_from_text'),
      ],
    );
  }

  return withAudit(
    nextState,
    'telegram_text_start_turn',
    event,
    [
      { type: 'StartAgentTurn', threadId: binding.binding.threadId, prompt: event.text },
      { type: 'EnsureViewMessage', chatId: event.chatId },
      persist('start_turn_from_text'),
    ],
  );
}

function handleTelegramCommand(
  state: AppState,
  event: Extract<DomainEvent, { type: 'TelegramCommandReceived' }>,
): Decision {
  if (isDuplicateUpdate(state, event.chatId, event.updateId)) {
    return noOp(state);
  }

  let nextState = markProcessedUpdate(state, event.chatId, event.updateId);
  if (!isAuthorized(nextState, event.userId, event.chatId)) {
    return withAudit(
      nextState,
      'telegram_unauthorized',
      event,
      [sendMessage(event.chatId, '未授权的用户或会话，已拒绝此次请求。'), persist('unauthorized_command')],
    );
  }

  const parsed = parseCommand(event.commandText);
  if (isParseError(parsed)) {
    return withAudit(
      nextState,
      'telegram_command_parse_error',
      { ...event, error: parsed.message },
      [sendMessage(event.chatId, `命令解析失败：${parsed.message}`), persist('command_parse_error')],
    );
  }

  return applyCommand(nextState, event.chatId, event.at, parsed, event);
}

function handleApprovalClick(
  state: AppState,
  event: Extract<DomainEvent, { type: 'TelegramApprovalClicked' }>,
): Decision {
  if (isDuplicateUpdate(state, event.chatId, event.updateId)) {
    return noOp(state);
  }
  let nextState = markProcessedUpdate(state, event.chatId, event.updateId);
  if (!isAuthorized(nextState, event.userId, event.chatId)) {
    return withAudit(
      nextState,
      'telegram_unauthorized_approval',
      event,
      [sendMessage(event.chatId, '未授权的用户或会话，无法处理审批。'), persist('unauthorized_approval')],
    );
  }
  return resolveApproval(nextState, event.approvalId, event.decision, event.chatId, event.at, event);
}

function handleThreadStarted(
  state: AppState,
  event: Extract<DomainEvent, { type: 'ThreadStarted' }>,
): Decision {
  const ensured = ensureBinding(state, event.chatId, event.at, event.workspace);
  const binding = {
    ...ensured.binding,
    threadId: event.threadId,
    updatedAt: event.at,
  };
  let nextState = {
    ...ensured.state,
    bindings: {
      ...ensured.state.bindings,
      [event.chatId]: binding,
    },
  };

  const pendingInput = nextState.pendingInputsByChatId[event.chatId];
  const effects: Effect[] = [persist('thread_started')];
  if (pendingInput) {
    nextState = {
      ...nextState,
      pendingInputsByChatId: {
        ...nextState.pendingInputsByChatId,
        [event.chatId]: undefined,
      },
    };

    if (pendingInput.runId) {
      const run = nextState.runs[pendingInput.runId];
      if (run) {
        nextState = {
          ...nextState,
          runs: {
            ...nextState.runs,
            [run.runId]: {
              ...run,
              threadId: event.threadId,
            },
          },
        };
      }
    }

    effects.unshift({
      type: 'StartAgentTurn',
      threadId: event.threadId,
      prompt: pendingInput.prompt,
    });
    effects.unshift({ type: 'EnsureViewMessage', chatId: event.chatId });
  }

  return {
    newState: nextState,
    emittedEvents: [],
    effects: [audit('thread_started', event), ...effects],
  };
}

function handleTurnStarted(
  state: AppState,
  event: Extract<DomainEvent, { type: 'TurnStarted' }>,
): Decision {
  const located = findBindingByThreadId(state, event.threadId);
  if (!located) {
    return noOp(state, [audit('turn_started_without_binding', event)]);
  }

  let nextState = {
    ...state,
    bindings: {
      ...state.bindings,
      [located.chatId]: {
        ...located.binding,
        activeTurnId: event.turnId,
        updatedAt: event.at,
      },
    },
    liveViewsByThreadId: {
      ...state.liveViewsByThreadId,
      [event.threadId]: {
        chatId: located.chatId,
        threadId: event.threadId,
        turnId: event.turnId,
        text: '',
        diff: null,
        updatedAt: event.at,
      },
    },
  };

  const run = findActiveRunByThread(nextState, event.threadId);
  if (run) {
    nextState = {
      ...nextState,
      runs: {
        ...nextState.runs,
        [run.runId]: {
          ...run,
          turnId: event.turnId,
          status: 'running',
          startedAt: run.startedAt ?? event.at,
        },
      },
    };
  }

  return {
    newState: nextState,
    emittedEvents: [],
    effects: [audit('turn_started', event), persist('turn_started')],
  };
}

function handleAgentTextDelta(
  state: AppState,
  event: Extract<DomainEvent, { type: 'AgentTextDelta' }>,
): Decision {
  const view = state.liveViewsByThreadId[event.threadId];
  if (!view) {
    return noOp(state, [audit('agent_text_delta_without_view', event)]);
  }

  const updatedView = {
    ...view,
    turnId: event.turnId,
    text: `${view.text}${event.delta}`,
    updatedAt: event.at,
  };
  const nextState = {
    ...state,
    liveViewsByThreadId: {
      ...state.liveViewsByThreadId,
      [event.threadId]: updatedView,
    },
  };

  const binding = state.bindings[view.chatId];
  const effects: Effect[] = [audit('agent_text_delta', { threadId: event.threadId, turnId: event.turnId })];
  if (binding?.lastViewMessageId) {
    effects.push({
      type: 'EditTelegramMessage',
      chatId: view.chatId,
      messageId: binding.lastViewMessageId,
      text: renderLiveView(updatedView.text, updatedView.diff),
    });
  }
  return { newState: nextState, emittedEvents: [], effects };
}

function handleDiffUpdated(
  state: AppState,
  event: Extract<DomainEvent, { type: 'DiffUpdated' }>,
): Decision {
  const view = state.liveViewsByThreadId[event.threadId];
  if (!view) {
    return noOp(state, [audit('diff_updated_without_view', event)]);
  }
  const updatedView = { ...view, diff: event.diff, updatedAt: event.at };
  return {
    newState: {
      ...state,
      liveViewsByThreadId: {
        ...state.liveViewsByThreadId,
        [event.threadId]: updatedView,
      },
    },
    emittedEvents: [],
    effects: [audit('diff_updated', event)],
  };
}

function handleApprovalRequested(
  state: AppState,
  event: Extract<DomainEvent, { type: 'ApprovalRequested' }>,
): Decision {
  if (state.pendingApprovals[event.approvalId]) {
    return noOp(state);
  }
  const located = findBindingByThreadId(state, event.threadId);
  if (!located) {
    return noOp(state, [audit('approval_requested_without_binding', event)]);
  }

  const approval: PendingApproval = {
    approvalId: event.approvalId,
    chatId: located.chatId,
    threadId: event.threadId,
    turnId: event.turnId,
    title: event.title,
    detail: event.detail,
    status: 'pending',
    createdAt: event.at,
    resolvedAt: null,
    messageId: null,
  };

  let nextState: AppState = {
    ...state,
    pendingApprovals: {
      ...state.pendingApprovals,
      [approval.approvalId]: approval,
    },
  };

  const run = findActiveRunByThread(nextState, event.threadId);
  if (run) {
    nextState = {
      ...nextState,
      runs: {
        ...nextState.runs,
        [run.runId]: {
          ...run,
          status: 'waiting_approval',
        },
      },
    };
  }

  return {
    newState: nextState,
    emittedEvents: [],
    effects: [
      audit('approval_requested', event),
      { type: 'SendTelegramApproval', chatId: approval.chatId, approvalId: approval.approvalId, title: approval.title, detail: approval.detail },
      persist('approval_requested'),
    ],
  };
}

function handleTurnCompleted(
  state: AppState,
  event: Extract<DomainEvent, { type: 'TurnCompleted' }>,
): Decision {
  const located = findBindingByThreadId(state, event.threadId);
  const effects: Effect[] = [audit('turn_completed', event)];
  let nextState = state;

  if (located) {
    nextState = {
      ...nextState,
      bindings: {
        ...nextState.bindings,
        [located.chatId]: {
          ...located.binding,
          activeTurnId: null,
          updatedAt: event.at,
        },
      },
    };
  }

  const run = findRunByThreadOrTurn(nextState, event.threadId, event.turnId);
  if (run) {
    const updatedRun = finalizeRun(nextState, run.runId, event.status, event.error, event.at);
    nextState = updatedRun.state;
    effects.push(...updatedRun.effects);
    const targetChatId = nextState.jobs[run.jobId]?.chatId ?? located?.chatId;
    if (targetChatId) {
      effects.push(sendMessage(targetChatId, renderRunCompletion(nextState.runs[run.runId])));
    }
  }

  return {
    newState: nextState,
    emittedEvents: [],
    effects: [...effects, persist('turn_completed')],
  };
}

function applyCommand(
  state: AppState,
  chatId: ChatId,
  at: ISOTime,
  command: Command,
  auditPayload: Record<string, unknown>,
): Decision {
  switch (command.kind) {
    case 'cwd':
      return handleCwdCommand(state, chatId, at, command.workspace, auditPayload);
    case 'status':
      return withAudit(state, 'status_requested', auditPayload, [sendMessage(chatId, renderStatus(state, chatId))]);
    case 'reset':
      return handleResetCommand(state, chatId, at, auditPayload);
    case 'diff':
      return withAudit(state, 'diff_requested', auditPayload, [sendMessage(chatId, renderDiffSummary(state, chatId))]);
    case 'help':
      return withAudit(state, 'help_requested', auditPayload, [sendMessage(chatId, renderHelp())]);
    case 'jobs':
      return withAudit(state, 'jobs_requested', auditPayload, [sendMessage(chatId, renderJobs(state, chatId))]);
    case 'job_show':
      return withAudit(state, 'job_show_requested', auditPayload, [sendMessage(chatId, renderJob(state, command.jobId))]);
    case 'job_pause':
      return updateJobEnabled(state, chatId, command.jobId, false, at, auditPayload);
    case 'job_resume':
      return updateJobEnabled(state, chatId, command.jobId, true, at, auditPayload);
    case 'job_delete':
      return deleteJob(state, chatId, command.jobId, at, auditPayload);
    case 'job_run':
      return handleJobDue(state, command.jobId, at, 'manual');
    case 'job_add_once':
      return addJobFromCommand(state, chatId, at, command, auditPayload);
    case 'job_add_daily':
      return addJobFromCommand(state, chatId, at, command, auditPayload);
    case 'job_add_weekly':
      return addJobFromCommand(state, chatId, at, command, auditPayload);
    case 'approve':
      return resolveApproval(state, command.approvalId, 'approved', chatId, at, auditPayload);
    case 'deny':
      return resolveApproval(state, command.approvalId, 'denied', chatId, at, auditPayload);
    default:
      return noOp(state);
  }
}

function handleCwdCommand(
  state: AppState,
  chatId: ChatId,
  at: ISOTime,
  workspace: string,
  auditPayload: Record<string, unknown>,
): Decision {
  if (!isWorkspaceAllowed(state, workspace)) {
    return withAudit(state, 'cwd_rejected', auditPayload, [sendMessage(chatId, `工作目录未在白名单中：${workspace}`)]);
  }

  const ensured = ensureBinding(state, chatId, at, workspace);
  const updatedBinding: Binding = {
    ...ensured.binding,
    workspace,
    threadId: null,
    activeTurnId: null,
    updatedAt: at,
  };

  const nextState = {
    ...ensured.state,
    bindings: {
      ...ensured.state.bindings,
      [chatId]: updatedBinding,
    },
  };

  return {
    newState: nextState,
    emittedEvents: [],
    effects: [audit('cwd_updated', auditPayload), sendMessage(chatId, `已绑定工作目录：${workspace}`), persist('cwd_updated')],
  };
}

function handleResetCommand(state: AppState, chatId: ChatId, at: ISOTime, auditPayload: Record<string, unknown>): Decision {
  const ensured = ensureBinding(state, chatId, at);
  const nextState = {
    ...ensured.state,
    bindings: {
      ...ensured.state.bindings,
      [chatId]: {
        ...ensured.binding,
        threadId: null,
        activeTurnId: null,
        updatedAt: at,
      },
    },
  };

  return {
    newState: nextState,
    emittedEvents: [],
    effects: [audit('session_reset', auditPayload), sendMessage(chatId, '会话已重置。'), persist('session_reset')],
  };
}

function updateJobEnabled(
  state: AppState,
  chatId: ChatId,
  jobId: string,
  enabled: boolean,
  at: ISOTime,
  auditPayload: Record<string, unknown>,
): Decision {
  const job = state.jobs[jobId];
  if (!job || job.chatId !== chatId) {
    return withAudit(state, 'job_not_found', auditPayload, [sendMessage(chatId, `任务不存在：${jobId}`)]);
  }

  const nextRunAt = enabled ? job.nextRunAt ?? computeNextRun(job.schedule, at) : job.nextRunAt;
  const nextState = {
    ...state,
    jobs: {
      ...state.jobs,
      [jobId]: {
        ...job,
        enabled,
        nextRunAt,
        updatedAt: at,
      },
    },
  };

  return {
    newState: nextState,
    emittedEvents: [{ type: 'JobUpdated', jobId, at }],
    effects: [
      audit(enabled ? 'job_resumed' : 'job_paused', auditPayload),
      sendMessage(chatId, enabled ? `任务已恢复：${jobId}` : `任务已暂停：${jobId}`),
      persist(enabled ? 'job_resumed' : 'job_paused'),
    ],
  };
}

function deleteJob(
  state: AppState,
  chatId: ChatId,
  jobId: string,
  at: ISOTime,
  auditPayload: Record<string, unknown>,
): Decision {
  const job = state.jobs[jobId];
  if (!job || job.chatId !== chatId) {
    return withAudit(state, 'job_not_found', auditPayload, [sendMessage(chatId, `任务不存在：${jobId}`)]);
  }
  if (state.activeRunByJobId[jobId]) {
    return withAudit(state, 'job_delete_blocked', auditPayload, [sendMessage(chatId, `任务正在执行中，无法删除：${jobId}`)]);
  }

  const jobs = { ...state.jobs };
  delete jobs[jobId];
  const activeRunByJobId = { ...state.activeRunByJobId };
  delete activeRunByJobId[jobId];

  return {
    newState: { ...state, jobs, activeRunByJobId },
    emittedEvents: [{ type: 'JobUpdated', jobId, at }],
    effects: [audit('job_deleted', auditPayload), sendMessage(chatId, `任务已删除：${jobId}`), persist('job_deleted')],
  };
}

function addJobFromCommand(
  state: AppState,
  chatId: ChatId,
  at: ISOTime,
  command: Extract<Command, { kind: 'job_add_once' | 'job_add_daily' | 'job_add_weekly' }>,
  auditPayload: Record<string, unknown>,
): Decision {
  if (!isWorkspaceAllowed(state, command.workspace)) {
    return withAudit(state, 'job_workspace_rejected', auditPayload, [sendMessage(chatId, `工作目录未在白名单中：${command.workspace}`)]);
  }

  const schedule = commandToSchedule(command);
  if (!schedule) {
    return withAudit(state, 'job_schedule_invalid', auditPayload, [sendMessage(chatId, '任务时间格式非法。')]);
  }

  const resolvedNextRunAt = schedule.kind === 'one_shot' ? schedule.runAt : computeNextRun(schedule, at);
  if (!resolvedNextRunAt) {
    return withAudit(state, 'job_schedule_invalid', auditPayload, [sendMessage(chatId, '任务时间必须晚于当前时间。')]);
  }

  const jobId = nextEntityId('job', Object.keys(state.jobs));
  const job: Job = {
    jobId,
    name: buildJobName(command.prompt),
    chatId,
    workspace: command.workspace,
    prompt: command.prompt,
    schedule,
    enabled: true,
    nextRunAt: resolvedNextRunAt,
    lastRunAt: null,
    createdAt: at,
    updatedAt: at,
  };

  const nextState = {
    ...state,
    jobs: {
      ...state.jobs,
      [jobId]: job,
    },
    activeRunByJobId: {
      ...state.activeRunByJobId,
      [jobId]: null,
    },
  };

  return {
    newState: nextState,
    emittedEvents: [{ type: 'JobCreated', jobId, at }],
    effects: [audit('job_created', { ...auditPayload, jobId }), sendMessage(chatId, `任务已创建：${jobId}，下次执行 ${resolvedNextRunAt}`), persist('job_created')],
  };
}

function handleJobDue(state: AppState, jobId: string, at: ISOTime, source: 'scheduled' | 'manual'): Decision {
  const job = state.jobs[jobId];
  if (!job || !job.enabled || state.activeRunByJobId[jobId]) {
    return noOp(state, [audit('job_due_ignored', { jobId, source })]);
  }

  const ensured = ensureBinding(state, job.chatId, at, job.workspace);
  const runId = nextEntityId('run', Object.keys(ensured.state.runs));
  const run: Run = {
    runId,
    jobId,
    threadId: ensured.binding.threadId,
    turnId: null,
    status: 'queued',
    startedAt: null,
    completedAt: null,
    error: null,
    resultSummary: null,
  };

  let nextState: AppState = {
    ...ensured.state,
    bindings: {
      ...ensured.state.bindings,
      [job.chatId]: {
        ...ensured.binding,
        workspace: job.workspace,
        updatedAt: at,
      },
    },
    runs: {
      ...ensured.state.runs,
      [runId]: run,
    },
    activeRunByJobId: {
      ...ensured.state.activeRunByJobId,
      [jobId]: runId,
    },
  };

  const effects: Effect[] = [
    audit('job_due', { jobId, source }),
    { type: 'AcquireJobLock', jobId },
    sendMessage(job.chatId, `定时任务开始：${job.name}`),
    persist('job_due'),
  ];

  if (ensured.binding.threadId) {
    effects.unshift({ type: 'EnsureViewMessage', chatId: job.chatId });
    effects.unshift({ type: 'StartAgentTurn', threadId: ensured.binding.threadId, prompt: job.prompt });
  } else {
    nextState = {
      ...nextState,
      pendingInputsByChatId: {
        ...nextState.pendingInputsByChatId,
        [job.chatId]: {
          kind: 'job' as const,
          chatId: job.chatId,
          workspace: job.workspace,
          prompt: job.prompt,
          createdAt: at,
          jobId: job.jobId,
          runId,
        },
      },
    };
    effects.unshift({ type: 'StartAgentThread', chatId: job.chatId, workspace: job.workspace });
  }

  return {
    newState: nextState,
    emittedEvents: [{ type: 'JobStarted', runId, jobId, at }],
    effects,
  };
}

function resolveApproval(
  state: AppState,
  approvalId: ApprovalId,
  decision: 'approved' | 'denied',
  chatId: ChatId,
  at: ISOTime,
  auditPayload: Record<string, unknown>,
): Decision {
  const approval = state.pendingApprovals[approvalId];
  if (!approval || approval.chatId !== chatId) {
    return withAudit(state, 'approval_not_found', auditPayload, [sendMessage(chatId, `审批不存在：${approvalId}`)]);
  }

  if (approval.status !== 'pending' || state.resolvedApprovalIds[approvalId]) {
    return noOp(state);
  }

  let nextState: AppState = {
    ...state,
    pendingApprovals: {
      ...state.pendingApprovals,
      [approvalId]: {
        ...approval,
        status: decision,
        resolvedAt: at,
      },
    },
    resolvedApprovalIds: {
      ...state.resolvedApprovalIds,
      [approvalId]: true,
    },
  };

  const run = findActiveRunByThread(nextState, approval.threadId);
  if (run) {
    nextState = {
      ...nextState,
      runs: {
        ...nextState.runs,
        [run.runId]: {
          ...run,
          status: decision === 'approved' ? 'running' : 'failed',
          completedAt: decision === 'denied' ? at : run.completedAt,
          error: decision === 'denied' ? 'approval_denied' : run.error,
        },
      },
    };
    if (decision === 'denied') {
      nextState = clearActiveRun(nextState, run.jobId);
    }
  }

  const effects: Effect[] = [
    audit('approval_resolved', { ...auditPayload, approvalId, decision }),
    { type: 'ReplyApprovalToAgent', approvalId, decision },
    persist('approval_resolved'),
  ];

  if (approval.messageId) {
    effects.unshift({
      type: 'EditTelegramMessage',
      chatId,
      messageId: approval.messageId,
      text: `审批 ${approvalId} 已${decision === 'approved' ? '批准' : '拒绝'}。`,
    });
  } else {
    effects.unshift(sendMessage(chatId, `审批 ${approvalId} 已${decision === 'approved' ? '批准' : '拒绝'}。`));
  }

  return {
    newState: nextState,
    emittedEvents: [{ type: 'ApprovalResolved', approvalId, decision, at }],
    effects,
  };
}

function finalizeRun(state: AppState, runId: string, status: RunStatus, error: string | null, at: ISOTime) {
  const run = state.runs[runId];
  const job = state.jobs[run.jobId];

  const updatedRun: Run = {
    ...run,
    status,
    completedAt: at,
    error,
    resultSummary: error ? `失败：${error}` : '执行完成',
  };

  let nextRunAt: ISOTime | null;
  let enabled: boolean;
  if (job.schedule.kind === 'one_shot') {
    nextRunAt = null;
    enabled = false;
  } else {
    nextRunAt = computeNextRun(job.schedule, at);
    enabled = true;
  }

  const nextState = clearActiveRun(
    {
      ...state,
      runs: {
        ...state.runs,
        [runId]: updatedRun,
      },
      jobs: {
        ...state.jobs,
        [job.jobId]: {
          ...job,
          enabled,
          nextRunAt,
          lastRunAt: at,
          updatedAt: at,
        },
      },
    },
    job.jobId,
  );

  return {
    state: nextState,
    effects: [
      { type: 'ReleaseJobLock', jobId: job.jobId } as Effect,
      { type: 'UpdateJobNextRun', jobId: job.jobId, nextRunAt } as Effect,
    ],
  };
}

export function recoverState(snapshot: AppState | null, at: ISOTime): AppState {
  if (!snapshot) {
    return createInitialState({ lastRecoveryAt: at });
  }

  const runs = Object.fromEntries(
    Object.entries(snapshot.runs).map(([runId, run]) => {
      if (run.status === 'queued' || run.status === 'running' || run.status === 'waiting_approval') {
        return [
          runId,
          {
            ...run,
            status: 'failed' as const,
            completedAt: at,
            error: 'interrupted_by_restart',
            resultSummary: '失败：interrupted_by_restart',
          },
        ];
      }
      return [runId, run];
    }),
  );

  const activeRunByJobId = Object.fromEntries(
    Object.keys(snapshot.activeRunByJobId).map((existingJobId) => [existingJobId, null]),
  );

  return {
    ...snapshot,
    runs,
    activeRunByJobId,
    lastRecoveryAt: at,
  };
}

function renderStatus(state: AppState, chatId: ChatId): string {
  const binding = state.bindings[chatId];
  const jobs = Object.values(state.jobs).filter((job) => job.chatId === chatId);
  const pendingApprovals = Object.values(state.pendingApprovals).filter(
    (approval) => approval.chatId === chatId && approval.status === 'pending',
  );

  return [
    `工作目录：${binding?.workspace || '(未绑定)'}`,
    `Thread：${binding?.threadId || '(无)'}`,
    `ActiveTurn：${binding?.activeTurnId || '(无)'}`,
    `任务数：${jobs.length}`,
    `待审批：${pendingApprovals.length}`,
  ].join('\n');
}

function renderDiffSummary(state: AppState, chatId: ChatId): string {
  const binding = state.bindings[chatId];
  if (!binding?.threadId) {
    return '当前没有活跃会话，暂无 diff 摘要。';
  }
  const view = state.liveViewsByThreadId[binding.threadId];
  return view?.diff ? `最近 diff 摘要：\n${view.diff}` : '最近没有可展示的 diff 摘要。';
}

function renderHelp(): string {
  return [
    '/cwd <workspace>',
    '/status',
    '/reset',
    '/diff',
    '/jobs',
    '/job add once "<YYYY-MM-DD HH:MM>" "<workspace>" "<prompt>"',
    '/job add daily "<HH:MM>" "<workspace>" "<prompt>"',
    '/job add weekly "<Mon,Wed,Fri>" "<HH:MM>" "<workspace>" "<prompt>"',
    '/job show <jobId>',
    '/job pause <jobId>',
    '/job resume <jobId>',
    '/job delete <jobId>',
    '/job run <jobId>',
    '/approve <approvalId>',
    '/deny <approvalId>',
  ].join('\n');
}

function renderJobs(state: AppState, chatId: ChatId): string {
  const jobs = Object.values(state.jobs).filter((job) => job.chatId === chatId);
  if (jobs.length === 0) {
    return '当前没有任务。';
  }
  return jobs
    .map((job) => `${job.jobId} | ${job.enabled ? 'enabled' : 'paused'} | next=${job.nextRunAt ?? 'n/a'} | ${job.name}`)
    .join('\n');
}

function renderJob(state: AppState, jobId: string): string {
  const job = state.jobs[jobId];
  if (!job) {
    return `任务不存在：${jobId}`;
  }
  return [
    `jobId: ${job.jobId}`,
    `name: ${job.name}`,
    `workspace: ${job.workspace}`,
    `enabled: ${job.enabled}`,
    `nextRunAt: ${job.nextRunAt ?? 'n/a'}`,
    `lastRunAt: ${job.lastRunAt ?? 'n/a'}`,
    `prompt: ${job.prompt}`,
  ].join('\n');
}

function renderLiveView(text: string, diff: string | null): string {
  return diff ? `${text}\n\nDiff:\n${diff}` : text;
}

function renderRunCompletion(run: Run): string {
  return `任务 ${run.jobId} 已结束，状态：${run.status}${run.error ? `，错误：${run.error}` : ''}`;
}

function commandToSchedule(
  command: Extract<Command, { kind: 'job_add_once' | 'job_add_daily' | 'job_add_weekly' }>,
): ScheduleSpec | null {
  switch (command.kind) {
    case 'job_add_once': {
      const runAt = toScheduledIsoFromLocalDateTime(command.runAt, DEFAULT_TIMEZONE);
      return runAt ? { kind: 'one_shot', runAt, timezone: DEFAULT_TIMEZONE } : null;
    }
    case 'job_add_daily': {
      const hm = parseHourMinute(command.hm);
      return hm ? { kind: 'daily', hour: hm.hour, minute: hm.minute, timezone: DEFAULT_TIMEZONE } : null;
    }
    case 'job_add_weekly': {
      const hm = parseHourMinute(command.hm);
      return hm
        ? { kind: 'weekly', weekdays: command.weekdays, hour: hm.hour, minute: hm.minute, timezone: DEFAULT_TIMEZONE }
        : null;
    }
  }
}

function nextEntityId(prefix: string, existingIds: string[]): string {
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  const max = existingIds.reduce((current, id) => {
    const match = re.exec(id);
    if (!match) {
      return current;
    }
    return Math.max(current, Number(match[1]));
  }, 0);
  return `${prefix}-${max + 1}`;
}

function buildJobName(prompt: string): string {
  const trimmed = prompt.trim();
  return trimmed.length <= 32 ? trimmed : `${trimmed.slice(0, 29)}...`;
}

function ensureBinding(state: AppState, chatId: ChatId, at: ISOTime, workspace?: string) {
  const existing = state.bindings[chatId];
  if (existing) {
    return {
      state,
      binding: workspace ? { ...existing, workspace } : existing,
    };
  }

  const binding: Binding = {
    chatId,
    workspace: workspace ?? state.acl.workspaces[0] ?? '',
    threadId: null,
    activeTurnId: null,
    lastViewMessageId: null,
    mode: 'interactive',
    createdAt: at,
    updatedAt: at,
  };
  return {
    state: {
      ...state,
      bindings: {
        ...state.bindings,
        [chatId]: binding,
      },
    },
    binding,
  };
}

function findBindingByThreadId(state: AppState, threadId: ThreadId): { chatId: ChatId; binding: Binding } | null {
  for (const [chatId, binding] of Object.entries(state.bindings)) {
    if (binding.threadId === threadId) {
      return { chatId, binding };
    }
  }
  return null;
}

function findActiveRunByThread(state: AppState, threadId: ThreadId): Run | null {
  for (const runId of Object.values(state.activeRunByJobId)) {
    if (!runId) {
      continue;
    }
    const run = state.runs[runId];
    if (run?.threadId === threadId) {
      return run;
    }
  }
  return null;
}

function findRunByThreadOrTurn(state: AppState, threadId: ThreadId, turnId: string): Run | null {
  for (const run of Object.values(state.runs)) {
    if (run.threadId === threadId && (run.turnId === null || run.turnId === turnId)) {
      return run;
    }
  }
  return null;
}

function clearActiveRun(state: AppState, jobId: string): AppState {
  return {
    ...state,
    activeRunByJobId: {
      ...state.activeRunByJobId,
      [jobId]: null,
    },
  };
}

function isAuthorized(state: AppState, userId: string, chatId: ChatId): boolean {
  return (
    (state.acl.users.includes(userId) || state.acl.admins.includes(userId)) &&
    state.acl.chats.includes(chatId)
  );
}

function isWorkspaceAllowed(state: AppState, workspace: string): boolean {
  return state.acl.workspaces.includes(workspace);
}

function isDuplicateUpdate(state: AppState, chatId: ChatId, updateId: number): boolean {
  return updateId <= (state.processedUpdateIds[chatId] ?? -1);
}

function markProcessedUpdate(state: AppState, chatId: ChatId, updateId: number): AppState {
  return {
    ...state,
    processedUpdateIds: {
      ...state.processedUpdateIds,
      [chatId]: Math.max(updateId, state.processedUpdateIds[chatId] ?? -1),
    },
  };
}

function noOp(state: AppState, effects: Effect[] = []): Decision {
  return { newState: state, emittedEvents: [], effects };
}

function withAudit(
  state: AppState,
  topic: string,
  payload: Record<string, unknown>,
  effects: Effect[],
): Decision {
  return {
    newState: state,
    emittedEvents: [],
    effects: [audit(topic, payload), ...effects],
  };
}

function audit(topic: string, payload: Record<string, unknown>): Effect {
  return { type: 'AppendAuditLog', topic, payload };
}

function persist(reason: string): Effect {
  return { type: 'PersistState', reason };
}

function sendMessage(chatId: ChatId, text: string): Effect {
  return { type: 'SendTelegramMessage', chatId, text };
}

function isParseError(value: Command | ParseError): value is ParseError {
  return 'code' in value;
}
