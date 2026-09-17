import { Inject, Injectable } from "@nestjs/common";
import { Stocktake } from "../../domain/stocktake.aggregate";
import { STOCKTAKE_REPOSITORY, type StocktakeRepositoryPort } from "../../domain/ports/stocktake-repository.port";

@Injectable()
export class ListStocktakesHandler {
  constructor(@Inject(STOCKTAKE_REPOSITORY) private readonly stocktakes: StocktakeRepositoryPort) {}

  execute(filter?: { branchId?: string }): Promise<Stocktake[]> {
    return this.stocktakes.list(filter);
  }
}
