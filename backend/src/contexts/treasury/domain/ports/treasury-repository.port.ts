import type { Treasury } from "../treasury.aggregate";

export interface TreasuryRepositoryPort {
  save(treasury: Treasury): Promise<void>;
  findById(id: string): Promise<Treasury | null>;
  // بيرجع الخزائن الرئيسية والمشتركة (بنوك) بتاعة فرع، أو كل الخزائن لو مفيش فرع محدد - نفس فلتر
  // الريبو القديم بالظبط (branch_id = X OR branch_id IS NULL)
  list(filter?: { branchId?: string }): Promise<Treasury[]>;
}

export const TREASURY_REPOSITORY = Symbol("TREASURY_REPOSITORY");
