"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapTelegramUpdateToEvent = mapTelegramUpdateToEvent;
function mapTelegramUpdateToEvent(update, at) {
    if (update.message?.text && update.message.from) {
        const chatId = String(update.message.chat.id);
        const userId = String(update.message.from.id);
        const eventBase = {
            updateId: update.update_id,
            userId,
            chatId,
            at,
        };
        if (update.message.text.startsWith('/')) {
            return {
                type: 'TelegramCommandReceived',
                commandText: update.message.text,
                ...eventBase,
            };
        }
        return {
            type: 'TelegramTextReceived',
            text: update.message.text,
            ...eventBase,
        };
    }
    if (update.callback_query?.data && update.callback_query.message) {
        const decision = parseApprovalCallback(update.callback_query.data);
        if (!decision) {
            return null;
        }
        return {
            type: 'TelegramApprovalClicked',
            updateId: update.update_id,
            userId: String(update.callback_query.from.id),
            chatId: String(update.callback_query.message.chat.id),
            approvalId: decision.approvalId,
            decision: decision.decision,
            at,
        };
    }
    return null;
}
function parseApprovalCallback(input) {
    const match = /^approval:(approved|denied):(.+)$/.exec(input);
    if (!match) {
        return null;
    }
    return {
        decision: match[1],
        approvalId: match[2],
    };
}
