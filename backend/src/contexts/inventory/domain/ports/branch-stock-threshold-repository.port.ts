import type { BranchStockThreshold } from "../branch-stock-threshold.aggregate";

export interface BranchStockBalanceWithThreshold {
  branchId: string;
  inventoryItemId: string;
  itemName: string;
  unit: string;
  quantity: number;
  reorderPoint: number | null;
  minStock: number | null;
  maxStock: number | null;
}

export interface BranchStockThresholdRepositoryPort {
  // بيرجّع حدود افتراضية (كله null) لو مفيش صف متسجّل لسه - مفيش إدراج فعلي في القاعدة إلا وقت save()
  // الأول (نفس فلسفة get() في KyselyPosSettingsRepository، بس هنا من غير lazy-insert لأن المفتاح مركّب
  // (فرع+صنف) مش صف واحد ثابت)
  get(branchId: string, inventoryItemId: string): Promise<BranchStockThreshold>;
  save(threshold: BranchStockThreshold): Promise<void>;
  // كل أرصدة الفرع (أو كل الفروع لو من غير branchId) مع حدودها لو متسجّلة - الفلترة لأصناف منخفضة
  // فعليًا بتحصل في application layer (راجع classifyStockLevel) مش هنا
  listBalancesWithThresholds(branchId?: string): Promise<BranchStockBalanceWithThreshold[]>;
}

export const BRANCH_STOCK_THRESHOLD_REPOSITORY = Symbol("BRANCH_STOCK_THRESHOLD_REPOSITORY");
