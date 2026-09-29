export interface PurchaseOrderReportRow {
  id: string; createdAt: string; status: string;
  supplierId: string; supplierName: string; branchId: string; branchName: string;
  itemsCount: number; totalValue: number;
}

export interface PurchaseReceiptReportRow {
  id: string; confirmedAt: string | null; status: string;
  supplierId: string | null; supplierName: string | null;
  branchId: string; branchName: string; purchaseOrderId: string | null;
  totalValue: number;
}

export interface PurchasePriceHistoryRow {
  purchaseOrderId: string; orderDate: string; status: string;
  supplierId: string; supplierName: string; quantity: number; unitPrice: number;
}

export interface PurchasePriceVarianceRow {
  purchaseOrderId: string; orderDate: string; supplierId: string; supplierName: string;
  inventoryItemId: string; itemName: string;
  previousPrice: number | null; newPrice: number; difference: number | null; differencePercent: number | null;
}

export interface SupplierPerformanceReport {
  supplierId: string; from: string; to: string;
  ordersCount: number; receivedOrdersCount: number; fulfillmentRate: number | null;
  avgLeadTimeDays: number | null;
}

export interface OutstandingPurchaseOrderRow {
  id: string; createdAt: string; supplierId: string; supplierName: string;
  branchId: string; branchName: string; itemsCount: number; totalValue: number;
}

// قراءة عبر Procurement مباشرة. قرار نطاق موثّق: schema المشتريات في neo (راجع تعليق migration 006)
// أجّلت عمدًا كتالوج "أسعار موردين" منفصل (supplier_items بالريبو القديم مع effective_from/effective_to)
// - purchase-price-history وpurchase-price-variance هنا بيتستنتجوا من سجل بنود أوامر الشراء الفعلية
// (purchase_order_items) بدل كتالوج أسعار مُعلَنة منفصل. ده فعليًا أدق (بيقارن أسعار اتدفعت فعلًا) لكنه
// معتمد على وجود PO سابق لنفس (مورد، صنف) - مفيش "سعر معلن حاليًا" لمورد لسه ماطلبش منه حاجة.
// outstanding-purchase-orders = أوامر حالتها SENT أو PARTIALLY_RECEIVED (نفس تعريف الريبو القديم:
// APPROVED/PARTIALLY_RECEIVED) - حالة الأمر بتتحدّث تلقائيًا مع تأكيد كل إذن استلام مربوط بيه.
export interface ProcurementReportsReaderPort {
  getPurchaseOrders(input: {
    branchId: string | null; supplierId?: string | null; status?: string | null; from: string; to: string;
  }): Promise<PurchaseOrderReportRow[]>;
  getPurchaseReceipts(input: {
    branchId: string | null; supplierId?: string | null; from: string; to: string;
  }): Promise<PurchaseReceiptReportRow[]>;
  getPurchasePriceHistory(input: { inventoryItemId: string; supplierId?: string | null }): Promise<PurchasePriceHistoryRow[]>;
  getPurchasePriceVariance(input: { branchId: string | null; from: string; to: string }): Promise<PurchasePriceVarianceRow[]>;
  getSupplierPerformance(input: { supplierId: string; from: string; to: string }): Promise<SupplierPerformanceReport>;
  getOutstandingPurchaseOrders(input: { branchId: string | null }): Promise<OutstandingPurchaseOrderRow[]>;
}

export const PROCUREMENT_REPORTS_READER = Symbol("PROCUREMENT_REPORTS_READER");
