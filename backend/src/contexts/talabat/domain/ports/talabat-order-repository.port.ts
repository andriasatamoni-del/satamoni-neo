import type { TalabatOrder } from "../talabat-order.aggregate";

export interface TalabatOrderRepositoryPort {
  save(order: TalabatOrder): Promise<void>;
  findById(id: string): Promise<TalabatOrder | null>;
  findByTalabatOrderId(talabatOrderId: string): Promise<TalabatOrder | null>;
  list(filter?: { branchId?: string; status?: string; from?: Date; to?: Date }): Promise<TalabatOrder[]>;
}

export const TALABAT_ORDER_REPOSITORY = Symbol("TALABAT_ORDER_REPOSITORY");
