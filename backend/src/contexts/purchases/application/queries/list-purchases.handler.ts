import { Inject, Injectable } from "@nestjs/common";
import { Purchase } from "../../domain/purchase.aggregate";
import { PURCHASE_REPOSITORY, type PurchaseRepositoryPort } from "../../domain/ports/purchase-repository.port";

export interface ListPurchasesQuery {
  branchId?: string;
  businessDate?: Date;
  status?: string;
}

@Injectable()
export class ListPurchasesHandler {
  constructor(@Inject(PURCHASE_REPOSITORY) private readonly purchases: PurchaseRepositoryPort) {}

  execute(query: ListPurchasesQuery): Promise<Purchase[]> {
    return this.purchases.list(query);
  }
}
