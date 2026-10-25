import type { PageRequest } from "../../../../shared/http/list-query.dto";
import type { TransferRequest } from "../transfer-request.aggregate";

export interface TransferRequestRepositoryPort {
  save(request: TransferRequest): Promise<void>;
  findById(id: string): Promise<TransferRequest | null>;
  list(filter?: { fromBranchId?: string; toBranchId?: string; involvingBranchId?: string; status?: string; fromDate?: Date; toDate?: Date }): Promise<TransferRequest[]>;
  listPage(filter?: { fromBranchId?: string; toBranchId?: string; involvingBranchId?: string; status?: string; fromDate?: Date; toDate?: Date }, page?: PageRequest): Promise<{ rows: TransferRequest[]; total: number }>;
}

export const TRANSFER_REQUEST_REPOSITORY = Symbol("TRANSFER_REQUEST_REPOSITORY");
