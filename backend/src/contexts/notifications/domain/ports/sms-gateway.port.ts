export type SmsSendResult =
  | { status: "sent" }
  | { status: "not_configured" }
  | { status: "failed"; error: string };

// أي بوابة SMS (أو بوابة واتساب نصية) بتقبل نداء HTTP بسيط - نفس db/sms-provider.js في الريبو القديم.
// عمرها ما بترمي exception: الفشل بيرجع status=failed
export interface SmsGatewayPort {
  isConfigured(): boolean;
  send(input: { to: string; message: string }): Promise<SmsSendResult>;
}

export const SMS_GATEWAY = Symbol("SMS_GATEWAY");
