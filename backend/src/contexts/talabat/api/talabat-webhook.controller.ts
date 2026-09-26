import { Controller, Post, RawBodyRequest, Req, UseFilters } from "@nestjs/common";
import type { Request } from "express";
import { ReceiveTalabatWebhookHandler } from "../application/commands/receive-talabat-webhook.handler";
import { TalabatDomainErrorFilter } from "./filters/domain-error.filter";

// endpoint عام - محمي بتوقيع HMAC (fail-closed داخل ReceiveTalabatWebhookHandler)، مش بتسجيل دخول
// (Talabat مستحيل تبعت JWT توكن بتاعنا) - نفس فلسفة docs/TALABAT-INTEGRATION.md قسم 4 بالحرف
@Controller("talabat/webhook")
@UseFilters(TalabatDomainErrorFilter)
export class TalabatWebhookController {
  constructor(private readonly receiveWebhook: ReceiveTalabatWebhookHandler) {}

  @Post("orders")
  async receiveOrder(@Req() req: RawBodyRequest<Request>) {
    const rawBody = req.rawBody?.toString("utf8") ?? JSON.stringify(req.body);
    const signatureHeader = req.headers["x-talabat-signature"] as string | undefined;
    return this.receiveWebhook.execute({ rawBody, signatureHeader });
  }
}
