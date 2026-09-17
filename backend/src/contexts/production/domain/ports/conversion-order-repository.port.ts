import type { ConversionOrder } from "../conversion-order.aggregate";

export interface ConversionOrderRepositoryPort {
  save(order: ConversionOrder): Promise<void>;
  findById(id: string): Promise<ConversionOrder | null>;
  list(filter?: { branchId?: string; status?: string }): Promise<ConversionOrder[]>;
}

export const CONVERSION_ORDER_REPOSITORY = Symbol("CONVERSION_ORDER_REPOSITORY");
