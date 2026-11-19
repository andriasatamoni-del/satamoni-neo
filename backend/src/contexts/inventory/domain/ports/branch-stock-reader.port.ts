import type { PageRequest } from "../../../../shared/http/list-query.dto";

export interface BranchStockRow {
  inventoryItemId: string;
  name: string;
  unit: string;
  itemType: string;
  quantity: number;
}

export interface BranchStockFilter {
  branchId: string;
  q?: string;
  itemType?: string;
}

export interface BranchStockReaderPort {
  list(filter: BranchStockFilter, page?: PageRequest): Promise<{ rows: BranchStockRow[]; total: number }>;
}

export const BRANCH_STOCK_READER = Symbol("BRANCH_STOCK_READER");
