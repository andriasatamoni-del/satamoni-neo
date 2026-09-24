import { Inject, Injectable } from "@nestjs/common";
import { Purchase } from "../../domain/purchase.aggregate";
import { PURCHASE_REPOSITORY, type PurchaseRepositoryPort } from "../../domain/ports/purchase-repository.port";
import { PurchaseNotFoundError } from "../../domain/errors";

@Injectable()
export class GetPurchaseHandler {
  constructor(@Inject(PURCHASE_REPOSITORY) private readonly purchases: PurchaseRepositoryPort) {}

  async execute(id: string): Promise<Purchase> {
    const purchase = await this.purchases.findById(id);
    if (!purchase) throw new PurchaseNotFoundError();
    return purchase;
  }
}
