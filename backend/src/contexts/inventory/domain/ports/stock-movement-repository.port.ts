import type { StockMovement } from "../stock-movement.aggregate";

export interface RecordMovementResult {
  balanceAfter: number;
}

export interface StockMovementRepositoryPort {
  // بيسجّل الحركة ويحدّث الرصيد المتحرك ذريًا في نفس المعاملة - لو النتيجة هتبقى رصيد سالب وoptions.
  // allowNegativeBalance مش true، بيرمي InsufficientStockError ومفيش حاجة بتتسجّل (rollback كامل)
  recordMovement(movement: StockMovement, options: { allowNegativeBalance: boolean }): Promise<RecordMovementResult>;
  getBalance(branchId: string, inventoryItemId: string): Promise<number>;
  listMovements(filter?: { inventoryItemId?: string; branchId?: string }): Promise<StockMovement[]>;
  findByLegacyReferenceKey(key: string): Promise<StockMovement | null>;
  // movements produced by one business transaction (e.g. referenceType "order" + order id)
  listByReference(referenceType: string, referenceId: string): Promise<StockMovement[]>;
}

export const STOCK_MOVEMENT_REPOSITORY = Symbol("STOCK_MOVEMENT_REPOSITORY");
