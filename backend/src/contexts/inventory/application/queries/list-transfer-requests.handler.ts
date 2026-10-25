import { Inject, Injectable } from "@nestjs/common";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { TransferRequest } from "../../domain/transfer-request.aggregate";
import { TRANSFER_REQUEST_REPOSITORY, type TransferRequestRepositoryPort } from "../../domain/ports/transfer-request-repository.port";

export interface ListTransferRequestsQuery {
  fromBranchId?: string;
  toBranchId?: string;
  involvingBranchId?: string;
  status?: string;
  fromDate?: Date;
  toDate?: Date;
}

@Injectable()
export class ListTransferRequestsHandler {
  constructor(@Inject(TRANSFER_REQUEST_REPOSITORY) private readonly requests: TransferRequestRepositoryPort) {}

  async execute(query: ListTransferRequestsQuery, page?: PageRequest): Promise<{ rows: TransferRequest[]; total: number }> {
    return this.requests.listPage(query, page);
  }
}
