import type { TransferRequest } from "../transfer-request.aggregate";

export interface TransferRequestRepositoryPort {
  save(request: TransferRequest): Promise<void>;
  findById(id: string): Promise<TransferRequest | null>;
  list(filter?: { fromBranchId?: string; toBranchId?: string; status?: string; fromDate?: Date; toDate?: Date }): Promise<TransferRequest[]>;
}

export const TRANSFER_REQUEST_REPOSITORY = Symbol("TRANSFER_REQUEST_REPOSITORY");
