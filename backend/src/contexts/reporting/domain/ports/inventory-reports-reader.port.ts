export interface InventoryValuationItemRow {
  branchId: string;
  branchName: string;
  inventoryItemId: string;
  itemName: string;
  unit: string;
  quantity: number;
  unitCost: number | null;
  value: number;
  costIncomplete: boolean;
}
export interface InventoryValuationReport {
  branchId: string | null;
  totalValue: number;
  byBranch: { branchId: string; branchName: string; totalValue: number }[];
  items: InventoryValuationItemRow[];
}

export interface StockCardRow {
  id: string;
  movementType: string;
  quantityDelta: number;
  unitCost: number | null;
  totalCost: number | null;
  balanceAfter: number;
  referenceType: string | null;
  referenceId: string | null;
  reason: string | null;
  performedBy: string | null;
  occurredAt: string;
}

export interface TransferReportLine {
  inventoryItemId: string;
  itemName: string;
  unit: string;
  requestedQuantity: number;
  dispatchedQuantity: number | null;
  receivedQuantity: number | null;
  variance: number | null;
}
export interface TransferReportRow {
  id: string;
  fromBranchId: string;
  fromBranchName: string | null;
  toBranchId: string;
  toBranchName: string;
  status: string;
  createdAt: string;
  dispatchedAt: string | null;
  receivedAt: string | null;
  lines: TransferReportLine[];
}

export interface NegativeStockRow {
  branchId: string;
  branchName: string;
  inventoryItemId: string;
  itemName: string;
  unit: string;
  quantity: number;
  negativeStockPolicy: string;
}

export interface InventoryComparisonRow {
  branchId: string;
  branchName: string;
  inventoryItemId: string;
  itemName: string;
  unit: string;
  quantity: number;
}

export interface ExpiringBatchRow {
  id: string;
  batchNumber: string;
  inventoryItemId: string;
  itemName: string;
  unit: string;
  branchId: string;
  branchName: string;
  remainingQuantity: number;
  expiryDate: string;
}

// قراءة عبر Inventory/Branches مباشرة. تقرير "دفعات هتنتهي صلاحيتها قريب" (expiring-batches) بقى متاح
// دلوقتي بعد BATCH-1 (inventory_batches)
export interface InventoryReportsReaderPort {
  getValuation(input: { branchId: string | null }): Promise<InventoryValuationReport>;
  getStockCard(input: { branchId: string; inventoryItemId: string; from?: string; to?: string }): Promise<StockCardRow[]>;
  getTransfers(input: { branchId: string | null; from: string; to: string }): Promise<TransferReportRow[]>;
  getNegativeStock(input: { branchId: string | null }): Promise<NegativeStockRow[]>;
  getInventoryComparison(input: { inventoryItemId: string | null }): Promise<InventoryComparisonRow[]>;
  getExpiringBatches(input: { days: number; branchId: string | null }): Promise<ExpiringBatchRow[]>;
}

export const INVENTORY_REPORTS_READER = Symbol("INVENTORY_REPORTS_READER");
