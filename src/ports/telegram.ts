import type { ApprovalId, ChatId, MessageId } from '../domain/types';

export interface TelegramPort {
  pollUpdates(offset?: number): Promise<unknown[]>;
  sendMessage(chatId: ChatId, text: string): Promise<{ messageId: MessageId }>;
  editMessage(chatId: ChatId, messageId: MessageId, text: string): Promise<void>;
  sendApproval(
    chatId: ChatId,
    approvalId: ApprovalId,
    title: string,
    detail: string,
  ): Promise<{ messageId: MessageId }>;
}
