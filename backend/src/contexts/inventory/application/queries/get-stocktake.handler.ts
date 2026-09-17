import { Inject, Injectable } from "@nestjs/common";
import { Stocktake } from "../../domain/stocktake.aggregate";
import { STOCKTAKE_REPOSITORY, type StocktakeRepositoryPort } from "../../domain/ports/stocktake-repository.port";
import { StocktakeNotFoundError } from "../../domain/errors";

@Injectable()
export class GetStocktakeHandler {
  constructor(@Inject(STOCKTAKE_REPOSITORY) private readonly stocktakes: StocktakeRepositoryPort) {}

  async execute(id: string): Promise<Stocktake> {
    const stocktake = await this.stocktakes.findById(id);
    if (!stocktake) throw new StocktakeNotFoundError();
    return stocktake;
  }
}
