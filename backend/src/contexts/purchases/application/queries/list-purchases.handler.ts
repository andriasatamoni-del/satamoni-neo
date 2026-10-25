import { Inject, Injectable } from "@nestjs/common";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
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

  execute(query: ListPurchasesQuery, page?: PageRequest): Promise<{ rows: Purchase[]; total: number }> {
    return this.purchases.listPage(query, page);
  }
}
