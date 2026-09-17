import { Inject, Injectable } from "@nestjs/common";
import { PurchaseReturn } from "../../domain/purchase-return.aggregate";
import {
  PURCHASE_RETURN_REPOSITORY,
  type PurchaseReturnRepositoryPort,
} from "../../domain/ports/purchase-return-repository.port";
import { PurchaseReturnNotFoundError } from "../../domain/errors";

export interface CancelPurchaseReturnCommand {
  purchaseReturnId: string;
  cancelledBy?: string | null;
}

@Injectable()
export class CancelPurchaseReturnHandler {
  constructor(@Inject(PURCHASE_RETURN_REPOSITORY) private readonly returns: PurchaseReturnRepositoryPort) {}

  async execute(command: CancelPurchaseReturnCommand): Promise<PurchaseReturn> {
    const purchaseReturn = await this.returns.findById(command.purchaseReturnId);
    if (!purchaseReturn) throw new PurchaseReturnNotFoundError();

    purchaseReturn.cancel({ cancelledBy: command.cancelledBy ?? null });
    await this.returns.save(purchaseReturn);
    return purchaseReturn;
  }
}
