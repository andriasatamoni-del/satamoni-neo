import { Inject, Injectable } from "@nestjs/common";
import { PurchaseRequest } from "../../domain/purchase-request.aggregate";
import {
  PURCHASE_REQUEST_REPOSITORY,
  type PurchaseRequestRepositoryPort,
} from "../../domain/ports/purchase-request-repository.port";
import { PurchaseRequestNotFoundError } from "../../domain/errors";

export interface EditPurchaseRequestCommand {
  purchaseRequestId: string;
  requiredDate?: Date | null;
  reason?: string | null;
  lines?: { inventoryItemId: string; requestedQuantity: number; unit?: string | null; notes?: string | null }[];
}

@Injectable()
export class EditPurchaseRequestHandler {
  constructor(@Inject(PURCHASE_REQUEST_REPOSITORY) private readonly requests: PurchaseRequestRepositoryPort) {}

  async execute(command: EditPurchaseRequestCommand): Promise<PurchaseRequest> {
    const request = await this.requests.findById(command.purchaseRequestId);
    if (!request) throw new PurchaseRequestNotFoundError();

    request.edit(command);
    await this.requests.save(request);
    return request;
  }
}
