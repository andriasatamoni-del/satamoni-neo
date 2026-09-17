import { Inject, Injectable } from "@nestjs/common";
import { PurchaseReturn } from "../../domain/purchase-return.aggregate";
import {
  PURCHASE_RETURN_REPOSITORY,
  type PurchaseReturnRepositoryPort,
} from "../../domain/ports/purchase-return-repository.port";

@Injectable()
export class ListPurchaseReturnsHandler {
  constructor(@Inject(PURCHASE_RETURN_REPOSITORY) private readonly returns: PurchaseReturnRepositoryPort) {}

  execute(filter?: { branchId?: string; supplierId?: string; status?: string }): Promise<PurchaseReturn[]> {
    return this.returns.list(filter);
  }
}
