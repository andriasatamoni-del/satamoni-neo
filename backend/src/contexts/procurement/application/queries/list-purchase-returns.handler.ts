import { Inject, Injectable } from "@nestjs/common";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { PurchaseReturn } from "../../domain/purchase-return.aggregate";
import {
  PURCHASE_RETURN_REPOSITORY,
  type PurchaseReturnRepositoryPort,
} from "../../domain/ports/purchase-return-repository.port";

@Injectable()
export class ListPurchaseReturnsHandler {
  constructor(@Inject(PURCHASE_RETURN_REPOSITORY) private readonly returns: PurchaseReturnRepositoryPort) {}

  execute(filter?: { branchId?: string; supplierId?: string; status?: string }, page?: PageRequest): Promise<{ rows: PurchaseReturn[]; total: number }> {
    return this.returns.listPage(filter, page);
  }
}
