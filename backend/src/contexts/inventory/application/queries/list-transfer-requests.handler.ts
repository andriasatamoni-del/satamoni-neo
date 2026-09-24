import { Inject, Injectable } from "@nestjs/common";
import { TransferRequest } from "../../domain/transfer-request.aggregate";
import { TRANSFER_REQUEST_REPOSITORY, type TransferRequestRepositoryPort } from "../../domain/ports/transfer-request-repository.port";

export interface ListTransferRequestsQuery {
  fromBranchId?: string;
  toBranchId?: string;
  status?: string;
  fromDate?: Date;
  toDate?: Date;
}

@Injectable()
export class ListTransferRequestsHandler {
  constructor(@Inject(TRANSFER_REQUEST_REPOSITORY) private readonly requests: TransferRequestRepositoryPort) {}

  async execute(query: ListTransferRequestsQuery): Promise<TransferRequest[]> {
    return this.requests.list(query);
  }
}
