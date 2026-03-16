import type { DomainEvent, ISOTime } from '../domain/types';

export interface TelegramUser {
  id: number | string;
}

export interface TelegramChat {
  id: number | string;
}

export interface TelegramMessage {
  message_id: number | string;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export function mapTelegramUpdateToEvent(update: TelegramUpdate, at: ISOTime): DomainEvent | null {
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

function parseApprovalCallback(
  input: string,
): { approvalId: string; decision: 'approved' | 'denied' } | null {
  const match = /^approval:(approved|denied):(.+)$/.exec(input);
  if (!match) {
    return null;
  }
  return {
    decision: match[1] as 'approved' | 'denied',
    approvalId: match[2],
  };
}
