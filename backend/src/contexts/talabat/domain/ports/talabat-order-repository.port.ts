import type { PageRequest } from "../../../../shared/http/list-query.dto";
import type { TalabatOrder } from "../talabat-order.aggregate";

export interface TalabatOrderRepositoryPort {
  save(order: TalabatOrder): Promise<void>;
  findById(id: string): Promise<TalabatOrder | null>;
  findByTalabatOrderId(talabatOrderId: string): Promise<TalabatOrder | null>;
  list(filter?: { branchId?: string; status?: string; from?: Date; to?: Date }): Promise<TalabatOrder[]>;
  listPage(filter?: { branchId?: string; status?: string; from?: Date; to?: Date }, page?: PageRequest): Promise<{ rows: TalabatOrder[]; total: number }>;
}

export const TALABAT_ORDER_REPOSITORY = Symbol("TALABAT_ORDER_REPOSITORY");
