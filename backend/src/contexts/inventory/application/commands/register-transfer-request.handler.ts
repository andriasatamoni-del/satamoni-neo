import { Inject, Injectable } from "@nestjs/common";
import { TransferRequest } from "../../domain/transfer-request.aggregate";
import { TRANSFER_REQUEST_REPOSITORY, type TransferRequestRepositoryPort } from "../../domain/ports/transfer-request-repository.port";

export interface RegisterTransferRequestCommand {
  fromBranchId: string;
  toBranchId: string;
  requestedBy?: string | null;
  requiredDate?: Date | null;
  notes?: string | null;
  lines: { inventoryItemId: string; requestedQuantity: number }[];
}

@Injectable()
export class RegisterTransferRequestHandler {
  constructor(@Inject(TRANSFER_REQUEST_REPOSITORY) private readonly requests: TransferRequestRepositoryPort) {}

  async execute(command: RegisterTransferRequestCommand): Promise<TransferRequest> {
    const request = TransferRequest.register(command);
    await this.requests.save(request);
    return request;
  }
}
