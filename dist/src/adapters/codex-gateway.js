"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapAgentNotificationToEvent = mapAgentNotificationToEvent;
function mapAgentNotificationToEvent(notification, fallbackAt) {
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
