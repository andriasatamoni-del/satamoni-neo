export interface TalabatWebhookEventRepositoryPort {
  // بيسجّل dedupe_key لو مش موجود، وبيرجع true لو ده أول مرة (نجح الإدراج) أو false لو مكرر (ON
  // CONFLICT DO NOTHING - نفس فلسفة webhook واتساب المُختبَر)
  recordIfNew(dedupeKey: string, rawBody: unknown): Promise<boolean>;
}

export const TALABAT_WEBHOOK_EVENT_REPOSITORY = Symbol("TALABAT_WEBHOOK_EVENT_REPOSITORY");
