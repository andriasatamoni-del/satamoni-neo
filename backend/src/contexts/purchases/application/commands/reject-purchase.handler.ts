import { Inject, Injectable } from "@nestjs/common";
import { Purchase } from "../../domain/purchase.aggregate";
import { PURCHASE_REPOSITORY, type PurchaseRepositoryPort } from "../../domain/ports/purchase-repository.port";
import { PurchaseNotFoundError } from "../../domain/errors";

export interface RejectPurchaseCommand {
  purchaseId: string;
  reviewedBy: string | null;
  reason?: string | null;
}

@Injectable()
export class RejectPurchaseHandler {
  constructor(@Inject(PURCHASE_REPOSITORY) private readonly purchases: PurchaseRepositoryPort) {}

  async execute(command: RejectPurchaseCommand): Promise<Purchase> {
    const purchase = await this.purchases.findById(command.purchaseId);
    if (!purchase) throw new PurchaseNotFoundError();
    purchase.reject({ reviewedBy: command.reviewedBy, reason: command.reason });
    await this.purchases.save(purchase);
    return purchase;
  }
}
