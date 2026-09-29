import { Inject, Injectable, Logger } from "@nestjs/common";
import { GetPosSettingsHandler } from "../../../settings/application/queries/get-pos-settings.handler";
import { AI_CHAT_CLIENT, type AiChatClientPort } from "../../domain/ports/ai-chat-client.port";
import { OUTBOUND_MESSENGER, type OutboundMessengerPort } from "../../domain/ports/outbound-messenger.port";
import { WHATSAPP_MESSAGE_PORT, type WhatsappMessagePort } from "../../domain/ports/whatsapp-message.port";
import type { WhatsappConversation } from "../../domain/whatsapp-conversation.aggregate";
import { buildSystemPrompt } from "./persona";
import { BOT_TOOL_DEFINITIONS, WhatsappBotTools } from "./bot-tools";

const HISTORY_LIMIT = 20;

export type BotOutcome =
  | { replied: true; delivered: boolean }
  | { replied: false; reason: "disabled" | "ai_not_configured" | "empty_reply" | "error" };

// نفس services/whatsapp-bot/conversation.js في الريبو القديم: سياق آخر 20 رسالة + شخصية + أدوات، والرد
// بيتسجّل في المحادثة ويتبعت فعليًا على نفس القناة. عمره ما بيرمي exception - أي فشل (Gemini واقع، إرسال
// فشل) بيتسجل في الـlog والمحادثة بتفضل متاحة للرد البشري عادي.
@Injectable()
export class WhatsappBotService {
  private readonly logger = new Logger(WhatsappBotService.name);
  // رسالتين ورا بعض لنفس العميل مايتعالجوش في نفس الوقت (كانوا هيتسابقوا على نفس مسودة الأوردر)
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(
    private readonly getSettings: GetPosSettingsHandler,
    @Inject(AI_CHAT_CLIENT) private readonly ai: AiChatClientPort,
    @Inject(OUTBOUND_MESSENGER) private readonly outbound: OutboundMessengerPort,
    @Inject(WHATSAPP_MESSAGE_PORT) private readonly messages: WhatsappMessagePort,
    private readonly tools: WhatsappBotTools
  ) {}

  async status(): Promise<{ enabled: boolean; aiConfigured: boolean; whatsappSendConfigured: boolean; socialSendConfigured: boolean }> {
    const settings = await this.getSettings.execute();
    return {
      enabled: settings.whatsappBotEnabled,
      aiConfigured: this.ai.isConfigured(),
      whatsappSendConfigured: this.outbound.isConfigured("whatsapp"),
      socialSendConfigured: this.outbound.isConfigured("messenger"),
    };
  }

  respond(conversation: WhatsappConversation, isNewConversation: boolean): Promise<BotOutcome> {
    const previous = this.queues.get(conversation.id) ?? Promise.resolve();
    const run = previous.then(() => this.respondNow(conversation, isNewConversation));
    const tracked = run.finally(() => {
      if (this.queues.get(conversation.id) === tracked) this.queues.delete(conversation.id);
    });
    this.queues.set(conversation.id, tracked);
    return run;
  }

  private async respondNow(conversation: WhatsappConversation, isNewConversation: boolean): Promise<BotOutcome> {
    try {
      const settings = await this.getSettings.execute();
      if (!settings.whatsappBotEnabled) return { replied: false, reason: "disabled" };
      if (!this.ai.isConfigured()) return { replied: false, reason: "ai_not_configured" };

      const history = await this.messages.listRecentByConversation(conversation.id, HISTORY_LIMIT);
      const reply = await this.ai.runToolLoop({
        system: buildSystemPrompt({ channel: conversation.channel, customerName: conversation.customerName, isNewConversation }),
        messages: history.map((m) => ({ role: m.direction === "in" ? "user" : "assistant", content: m.body })),
        tools: BOT_TOOL_DEFINITIONS,
        executeTool: (name, args) => this.tools.execute(name, args, { conversation }),
      });
      if (!reply) return { replied: false, reason: "empty_reply" };

      const sent = await this.outbound.send({ channel: conversation.channel, to: conversation.phone, text: reply });
      await this.messages.record({
        conversationId: conversation.id,
        direction: "out",
        body: reply,
        waMessageId: sent.sent ? sent.externalMessageId : null,
      });
      if (!sent.sent && sent.reason === "failed") this.logger.warn(`bot reply not delivered (${conversation.channel}): ${sent.error}`);
      return { replied: true, delivered: sent.sent };
    } catch (err) {
      this.logger.error(`bot error (${conversation.channel}, ${conversation.id}): ${err instanceof Error ? err.message : err}`);
      return { replied: false, reason: "error" };
    }
  }
}
