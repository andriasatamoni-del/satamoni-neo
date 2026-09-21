export interface DriverSettlementPreview {
  driverId: string;
  orderCount: number;
  codExpected: number;
  codCollected: number;
  expectedHandover: number;
  bonusTotal: number;
}

export interface PendingSettlementDriver {
  driverId: string;
  driverName: string;
  pendingOrderCount: number;
  pendingCash: number;
}

export interface DriverDayOrderLine {
  assignmentId: string;
  orderId: string;
  total: number;
  collectedAmount: number | null;
  deliveredAt: Date;
  paymentKind: string | null;
  bonus: number;
  collected: boolean;
}

export interface DriverDayOrdersReport {
  driverId: string;
  driverName: string;
  date: string;
  orders: DriverDayOrderLine[];
  orderCount: number;
  bonusTotal: number;
  collectedBonusTotal: number;
  pendingBonusTotal: number;
  cashPendingCount: number;
  cashCollectedCount: number;
}

// قراءات تشغيلية لتسوية كاش السائقين - مش مسؤولية DriverSettlement aggregate نفسه (بيتعامل بس مع
// دفعة بيتحسب فعليًا وقت التسجيل - راجع تعليقه)؛ دول عرض/معاينة بس، نفس فلسفة ShiftFinancialsReaderPort
// بالظبط (قراءة حيّة من orders/delivery_assignments وقت الطلب، مفيش تخزين وسيط)
export interface DriverSettlementReaderPort {
  previewUnsettled(driverId: string): Promise<DriverSettlementPreview>;
  listPendingDrivers(branchId: string): Promise<PendingSettlementDriver[]>;
  getDriverDayOrders(driverId: string, date?: string): Promise<DriverDayOrdersReport>;
}

export const DRIVER_SETTLEMENT_READER = Symbol("DRIVER_SETTLEMENT_READER");
