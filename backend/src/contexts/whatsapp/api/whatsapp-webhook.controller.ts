import { Body, Controller, Post, UseFilters } from "@nestjs/common";
import { ReceiveWhatsappMessageHandler } from "../application/commands/receive-whatsapp-message.handler";
import { ReceiveWebhookMessageDto } from "./dto/receive-webhook-message.dto";
import { WhatsappDomainErrorFilter } from "./filters/domain-error.filter";

// endpoint عام من غير أي مصادقة عمدًا - نفس فلسفة POST /api/whatsapp/webhook في الريبو القديم: ميتا
// (أو أي مصدر خارجي تاني) مستحيل يبعت JWT توكن بتاعنا. أول ما بيانات اعتماد Meta الحقيقية تتوفر، لازم
// يتضاف هنا تحقق توقيع (X-Hub-Signature-256 HMAC مقارنة بـWHATSAPP_APP_SECRET) قبل أي معالجة - حاليًا
// من غير أي تحقق لأنه مفيش سر حقيقي نتحقق بيه أصلًا
@Controller("whatsapp/webhook")
@UseFilters(WhatsappDomainErrorFilter)
export class WhatsappWebhookController {
  constructor(private readonly receiveMessage: ReceiveWhatsappMessageHandler) {}

  @Post()
  async receive(@Body() dto: ReceiveWebhookMessageDto) {
    const conversation = await this.receiveMessage.execute(dto);
    return { conversationId: conversation.id };
  }
}
