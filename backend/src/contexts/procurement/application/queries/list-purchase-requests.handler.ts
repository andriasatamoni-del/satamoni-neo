import { Inject, Injectable } from "@nestjs/common";
import { PurchaseRequest } from "../../domain/purchase-request.aggregate";
import {
  PURCHASE_REQUEST_REPOSITORY,
  type PurchaseRequestRepositoryPort,
} from "../../domain/ports/purchase-request-repository.port";

@Injectable()
export class ListPurchaseRequestsHandler {
  constructor(@Inject(PURCHASE_REQUEST_REPOSITORY) private readonly requests: PurchaseRequestRepositoryPort) {}

  execute(filter?: { branchId?: string; status?: string }): Promise<PurchaseRequest[]> {
    return this.requests.list(filter);
  }
}
