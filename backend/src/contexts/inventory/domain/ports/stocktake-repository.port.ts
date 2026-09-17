import type { Stocktake } from "../stocktake.aggregate";

export interface StocktakeRepositoryPort {
  save(stocktake: Stocktake): Promise<void>;
  findById(id: string): Promise<Stocktake | null>;
  list(filter?: { branchId?: string }): Promise<Stocktake[]>;
}

export const STOCKTAKE_REPOSITORY = Symbol("STOCKTAKE_REPOSITORY");
