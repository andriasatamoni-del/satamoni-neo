import { createHmac, timingSafeEqual } from "node:crypto";
import { Injectable } from "@nestjs/common";

// توقيع HMAC-SHA256 - نفس فلسفة talabat-webhook-auth.js بالريبو القديم بالحرف: fail-closed دايمًا.
// لو TALABAT_WEBHOOK_SECRET مش متسجّل في بيئة السيرفر، أو التوقيع مفقود/غلط، الطلب بيتّرفض - مفيش
// "وضع تطوير من غير تحقق" هنا خالص (على عكس whatsapp-webhook.controller.ts اللي معندهاش سر حقيقي
// نتحقق بيه أصلًا - هنا اسم الـheader والخوارزمية افتراض موثّق لحد ما مواصفة Talabat الحقيقية تتأكد،
// راجع docs/TALABAT-INTEGRATION.md قسم 8 بند 4)
@Injectable()
export class TalabatWebhookAuthService {
  verify(rawBody: string, signatureHeader: string | undefined): boolean {
    const secret = process.env.TALABAT_WEBHOOK_SECRET;
    if (!secret || !signatureHeader) return false;

    const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
    const expectedBuffer = Buffer.from(expected, "hex");
    const providedBuffer = Buffer.from(signatureHeader.replace(/^sha256=/, ""), "hex");
    if (expectedBuffer.length !== providedBuffer.length) return false;

    return timingSafeEqual(expectedBuffer, providedBuffer);
  }
}
