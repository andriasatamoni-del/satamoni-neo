import { Inject, Injectable } from "@nestjs/common";
import { PurchaseRequest } from "../../domain/purchase-request.aggregate";
import {
  PURCHASE_REQUEST_REPOSITORY,
  type PurchaseRequestRepositoryPort,
} from "../../domain/ports/purchase-request-repository.port";

export interface RegisterPurchaseRequestCommand {
  branchId: string;
  requestedBy?: string | null;
  requiredDate?: Date | null;
  reason?: string | null;
  lines: { inventoryItemId: string; requestedQuantity: number; unit?: string | null; notes?: string | null }[];
}

@Injectable()
export class RegisterPurchaseRequestHandler {
  constructor(@Inject(PURCHASE_REQUEST_REPOSITORY) private readonly requests: PurchaseRequestRepositoryPort) {}

  async execute(command: RegisterPurchaseRequestCommand): Promise<PurchaseRequest> {
    const request = PurchaseRequest.register(command);
    await this.requests.save(request);
    return request;
  }
}
