import type { PageRequest } from "../../../../shared/http/list-query.dto";
import type { ConversionOrder } from "../conversion-order.aggregate";

export interface ConversionOrderRepositoryPort {
  save(order: ConversionOrder): Promise<void>;
  findById(id: string): Promise<ConversionOrder | null>;
  list(filter?: { branchId?: string; status?: string }): Promise<ConversionOrder[]>;
  listPage(filter?: { branchId?: string; status?: string }, page?: PageRequest): Promise<{ rows: ConversionOrder[]; total: number }>;
}

export const CONVERSION_ORDER_REPOSITORY = Symbol("CONVERSION_ORDER_REPOSITORY");
