export interface FollowupQueueRow {
  orderId: string;
  branchId: string;
  branchName: string;
  customerName: string | null;
  customerPhone: string | null;
  addressDetails: string | null;
  total: number;
  deliveredAt: Date;
  lastCallResult: string | null;
  lastNotes: string | null;
  lastCalledAt: Date | null;
}

export interface FollowupQueueReaderPort {
  // أوردرات دليفري اتسلّمت ولسه محتاجة مكالمة متابعة: إما لسه ما اتصلناش بيها خالص، أو اتصلنا وماردّوش
  // (no_answer) فلسه تستاهل محاولة تانية. "مش راد بعد 3 محاولات" اعتباره نهائي - بيخرج من الطابور
  // ومش بيرجع تاني (نفس فلسفة الريبو القديم بالظبط، راجع routes/crm.js)
  listQueue(branchId?: string): Promise<FollowupQueueRow[]>;
}

export const FOLLOWUP_QUEUE_READER = Symbol("FOLLOWUP_QUEUE_READER");
