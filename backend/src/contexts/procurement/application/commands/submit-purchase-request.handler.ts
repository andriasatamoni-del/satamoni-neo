import { Inject, Injectable } from "@nestjs/common";
import { PurchaseRequest } from "../../domain/purchase-request.aggregate";
import {
  PURCHASE_REQUEST_REPOSITORY,
  type PurchaseRequestRepositoryPort,
} from "../../domain/ports/purchase-request-repository.port";
import { PurchaseRequestNotFoundError } from "../../domain/errors";

@Injectable()
export class SubmitPurchaseRequestHandler {
  constructor(@Inject(PURCHASE_REQUEST_REPOSITORY) private readonly requests: PurchaseRequestRepositoryPort) {}

  async execute(purchaseRequestId: string): Promise<PurchaseRequest> {
    const request = await this.requests.findById(purchaseRequestId);
    if (!request) throw new PurchaseRequestNotFoundError();

    request.submit();
    await this.requests.save(request);
    return request;
  }
}
