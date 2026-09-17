import { Inject, Injectable } from "@nestjs/common";
import { PurchaseRequest } from "../../domain/purchase-request.aggregate";
import {
  PURCHASE_REQUEST_REPOSITORY,
  type PurchaseRequestRepositoryPort,
} from "../../domain/ports/purchase-request-repository.port";
import { PurchaseRequestNotFoundError } from "../../domain/errors";

export interface RejectPurchaseRequestCommand {
  purchaseRequestId: string;
  rejectedBy?: string | null;
  reason: string;
}

@Injectable()
export class RejectPurchaseRequestHandler {
  constructor(@Inject(PURCHASE_REQUEST_REPOSITORY) private readonly requests: PurchaseRequestRepositoryPort) {}

  async execute(command: RejectPurchaseRequestCommand): Promise<PurchaseRequest> {
    const request = await this.requests.findById(command.purchaseRequestId);
    if (!request) throw new PurchaseRequestNotFoundError();

    request.reject({ rejectedBy: command.rejectedBy ?? null, reason: command.reason });
    await this.requests.save(request);
    return request;
  }
}
