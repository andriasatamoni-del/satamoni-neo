import { Controller, ForbiddenException, Get, HttpCode, Logger, Post, Query, RawBodyRequest, Req, UnauthorizedException } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { Request } from "express";
import { ReceiveWhatsappMessageHandler } from "../application/commands/receive-whatsapp-message.handler";
import { WhatsappBotService } from "../application/bot/whatsapp-bot.service";
import { parseMetaWebhook, verifyMetaHandshake, verifyMetaSignature } from "../infrastructure/meta/meta-webhook";

// webhook Meta العام (واتساب + ماسنجر + إنستجرام - نفس التطبيق ونفس الرابط). مفيش JWT (Meta مستحيل
// تبعته) - الحماية هي توقيع X-Hub-Signature-256، fail-closed لو META_APP_SECRET مش متضاف.
// SkipThrottle: كل رسايل كل العملاء جاية من سيرفرات Meta نفسها، فحد الـ100 طلب/دقيقة لكل IP كان هيقفل
// الاستقبال وقت الزحمة.
@Controller("whatsapp/webhook")
@SkipThrottle()
export class WhatsappWebhookController {
  private readonly logger = new Logger(WhatsappWebhookController.name);

  constructor(
    private readonly receiveMessage: ReceiveWhatsappMessageHandler,
    private readonly bot: WhatsappBotService
  ) {}

  // خطوة التحقق وقت ربط الرابط في لوحة Meta - لازم يرجع الـchallenge نص خام
  @Get()
  verify(
    @Query("hub.mode") mode?: string,
    @Query("hub.verify_token") token?: string,
    @Query("hub.challenge") challenge?: string
  ): string {
    const result = verifyMetaHandshake({ mode, token, challenge });
    if (!result) throw new ForbiddenException();
    return result;
  }

  // Meta بتعيد إرسال أي إشعار مارجعلوش 200 بسرعة - فالرد الآلي بيشتغل في الخلفية بعد تسجيل الرسالة
  // (مش جوّه نفس الطلب)، والرسالة المكررة (نفس id) بتتسجل مرة واحدة بس
  @Post()
  @HttpCode(200)
  async receive(@Req() req: RawBodyRequest<Request>) {
    if (!verifyMetaSignature(req.rawBody, req.headers["x-hub-signature-256"] as string | undefined)) {
      throw new UnauthorizedException("توقيع الـwebhook مش صحيح");
    }

    const messages = parseMetaWebhook(req.body);
    let received = 0;
    for (const message of messages) {
      const result = await this.receiveMessage.execute(message);
      if (!result.isNewMessage) continue;
      received++;
      void this.bot.respond(result.conversation, result.isNewConversation).catch((err) => {
        this.logger.error(`bot respond failed: ${err instanceof Error ? err.message : err}`);
      });
    }
    return { received };
  }
}
