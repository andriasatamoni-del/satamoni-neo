import { Inject, Injectable } from "@nestjs/common";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { PurchaseRequest } from "../../domain/purchase-request.aggregate";
import {
  PURCHASE_REQUEST_REPOSITORY,
  type PurchaseRequestRepositoryPort,
} from "../../domain/ports/purchase-request-repository.port";

@Injectable()
export class ListPurchaseRequestsHandler {
  constructor(@Inject(PURCHASE_REQUEST_REPOSITORY) private readonly requests: PurchaseRequestRepositoryPort) {}

  execute(filter?: { branchId?: string; status?: string }, page?: PageRequest): Promise<{ rows: PurchaseRequest[]; total: number }> {
    return this.requests.listPage(filter, page);
  }
}
