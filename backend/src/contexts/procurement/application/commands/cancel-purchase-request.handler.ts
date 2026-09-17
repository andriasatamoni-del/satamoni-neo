import { Inject, Injectable } from "@nestjs/common";
import { PurchaseRequest } from "../../domain/purchase-request.aggregate";
import {
  PURCHASE_REQUEST_REPOSITORY,
  type PurchaseRequestRepositoryPort,
} from "../../domain/ports/purchase-request-repository.port";
import { PurchaseRequestNotFoundError } from "../../domain/errors";

export interface CancelPurchaseRequestCommand {
  purchaseRequestId: string;
  cancelledBy?: string | null;
}

@Injectable()
export class CancelPurchaseRequestHandler {
  constructor(@Inject(PURCHASE_REQUEST_REPOSITORY) private readonly requests: PurchaseRequestRepositoryPort) {}

  async execute(command: CancelPurchaseRequestCommand): Promise<PurchaseRequest> {
    const request = await this.requests.findById(command.purchaseRequestId);
    if (!request) throw new PurchaseRequestNotFoundError();

    request.cancel({ cancelledBy: command.cancelledBy ?? null });
    await this.requests.save(request);
    return request;
  }
}
