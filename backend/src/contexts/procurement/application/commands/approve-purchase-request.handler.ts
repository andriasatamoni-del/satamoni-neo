import { Inject, Injectable } from "@nestjs/common";
import { PurchaseRequest } from "../../domain/purchase-request.aggregate";
import {
  PURCHASE_REQUEST_REPOSITORY,
  type PurchaseRequestRepositoryPort,
} from "../../domain/ports/purchase-request-repository.port";
import { PurchaseRequestNotFoundError } from "../../domain/errors";

export interface ApprovePurchaseRequestCommand {
  purchaseRequestId: string;
  approvedBy?: string | null;
}

@Injectable()
export class ApprovePurchaseRequestHandler {
  constructor(@Inject(PURCHASE_REQUEST_REPOSITORY) private readonly requests: PurchaseRequestRepositoryPort) {}

  async execute(command: ApprovePurchaseRequestCommand): Promise<PurchaseRequest> {
    const request = await this.requests.findById(command.purchaseRequestId);
    if (!request) throw new PurchaseRequestNotFoundError();

    request.approve({ approvedBy: command.approvedBy ?? null });
    await this.requests.save(request);
    return request;
  }
}
