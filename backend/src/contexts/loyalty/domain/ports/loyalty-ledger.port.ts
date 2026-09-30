export type LoyaltyTransactionKind = "earn" | "redeem" | "reverse_earn" | "refund_redeem" | "adjust";

export interface LoyaltyTransaction {
  id: string;
  kind: LoyaltyTransactionKind;
  points: number;
  orderId: string | null;
  rewardName: string | null;
  note: string | null;
  createdAt: Date;
}

// سجل النقاط + الرصيد (customers.loyalty_points) - كل عملية بتغيّر الاتنين في نفس الـtransaction مع
// قفل صف العميل، فالرصيد عمره ما بيختلف عن مجموع الحركات اللي بعد الرصيد الافتتاحي المستورد
export interface LoyaltyLedgerPort {
  balance(customerId: string): Promise<number>;
  // false لو الطلب ده كسب قبل كده (idempotent)
  earnForOrder(customerId: string, orderId: string, points: number): Promise<boolean>;
  // بيحجز النقاط لطلب لسه بيتسجّل (مفتاحه clientRequestId). نفس المفتاح مرتين = حجز واحد بس.
  // بيرمي InsufficientLoyaltyPointsError لو الرصيد مش كفاية
  reserveRedemption(input: { customerId: string; requestId: string; rewardId: string; points: number; note: string }): Promise<void>;
  attachReservationToOrder(requestId: string, orderId: string): Promise<void>;
  // الطلب فشل قبل ما يتسجّل - الحجز بيتشال والنقاط بترجع
  releaseReservation(requestId: string): Promise<void>;
  // الطلب اتلغى: النقاط المصروفة عليه بترجع، والمكسوبة منه (لو فيه) بتتسحب
  settleCancelledOrder(orderId: string): Promise<void>;
  history(customerId: string, limit: number): Promise<LoyaltyTransaction[]>;
}

export const LOYALTY_LEDGER = Symbol("LOYALTY_LEDGER");
