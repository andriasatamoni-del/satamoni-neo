import { Inject, Injectable } from "@nestjs/common";
import { PurchaseReturn } from "../../domain/purchase-return.aggregate";
import {
  PURCHASE_RETURN_REPOSITORY,
  type PurchaseReturnRepositoryPort,
} from "../../domain/ports/purchase-return-repository.port";
import { PurchaseReturnNotFoundError } from "../../domain/errors";

@Injectable()
export class GetPurchaseReturnHandler {
  constructor(@Inject(PURCHASE_RETURN_REPOSITORY) private readonly returns: PurchaseReturnRepositoryPort) {}

  async execute(id: string): Promise<PurchaseReturn> {
    const purchaseReturn = await this.returns.findById(id);
    if (!purchaseReturn) throw new PurchaseReturnNotFoundError();
    return purchaseReturn;
  }
}
