import { Inject, Injectable } from "@nestjs/common";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { Stocktake } from "../../domain/stocktake.aggregate";
import { STOCKTAKE_REPOSITORY, type StocktakeRepositoryPort } from "../../domain/ports/stocktake-repository.port";

@Injectable()
export class ListStocktakesHandler {
  constructor(@Inject(STOCKTAKE_REPOSITORY) private readonly stocktakes: StocktakeRepositoryPort) {}

  execute(filter?: { branchId?: string }, page?: PageRequest): Promise<{ rows: Stocktake[]; total: number }> {
    return this.stocktakes.listPage(filter, page);
  }
}
