import { Injectable } from "@nestjs/common";
import type { SmsGatewayPort, SmsSendResult } from "../../domain/ports/sms-gateway.port";

const REQUEST_TIMEOUT_MS = 15_000;

// بوابة عامة مش مربوطة بمزوّد بعينه - أي مزوّد مصري أو دولي بيقبل {to, message}:
//   SMS_WEBHOOK_URL          - من غيره: not_configured من غير أي محاولة اتصال
//   SMS_WEBHOOK_METHOD       - POST (افتراضي، JSON body) أو GET (query string)
//   SMS_WEBHOOK_AUTH_HEADER  - بيتبعت كـAuthorization header لو متضاف
@Injectable()
export class WebhookSmsGateway implements SmsGatewayPort {
  isConfigured(): boolean {
    return Boolean(process.env.SMS_WEBHOOK_URL);
  }

  async send(input: { to: string; message: string }): Promise<SmsSendResult> {
    const url = process.env.SMS_WEBHOOK_URL;
    if (!url) return { status: "not_configured" };

    const method = (process.env.SMS_WEBHOOK_METHOD || "POST").toUpperCase();
    const headers: Record<string, string> = {};
    if (process.env.SMS_WEBHOOK_AUTH_HEADER) headers.Authorization = process.env.SMS_WEBHOOK_AUTH_HEADER;

    let target = url;
    let body: string | undefined;
    if (method === "GET") {
      const qs = new URLSearchParams({ to: input.to, message: input.message }).toString();
      target = `${url}${url.includes("?") ? "&" : "?"}${qs}`;
    } else {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify({ to: input.to, message: input.message });
    }

    try {
      const res = await fetch(target, { method, headers, body, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!res.ok) return { status: "failed", error: `HTTP ${res.status}` };
      return { status: "sent" };
    } catch (err) {
      return { status: "failed", error: err instanceof Error ? err.message : String(err) };
    }
  }
}
