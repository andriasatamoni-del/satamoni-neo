import type { PageRequest } from "../../../../shared/http/list-query.dto";
import type { Stocktake } from "../stocktake.aggregate";

export interface StocktakeRepositoryPort {
  save(stocktake: Stocktake): Promise<void>;
  findById(id: string): Promise<Stocktake | null>;
  list(filter?: { branchId?: string }): Promise<Stocktake[]>;
  listPage(filter?: { branchId?: string }, page?: PageRequest): Promise<{ rows: Stocktake[]; total: number }>;
}

export const STOCKTAKE_REPOSITORY = Symbol("STOCKTAKE_REPOSITORY");
