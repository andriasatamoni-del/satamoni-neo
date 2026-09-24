import { Inject, Injectable } from "@nestjs/common";
import { TransferRequest } from "../../domain/transfer-request.aggregate";
import { TRANSFER_REQUEST_REPOSITORY, type TransferRequestRepositoryPort } from "../../domain/ports/transfer-request-repository.port";
import { TransferRequestNotFoundError } from "../../domain/errors";

export interface ApproveTransferRequestCommand {
  requestId: string;
  approvedBy: string | null;
  approvedQuantities?: Record<string, number>;
}

@Injectable()
export class ApproveTransferRequestHandler {
  constructor(@Inject(TRANSFER_REQUEST_REPOSITORY) private readonly requests: TransferRequestRepositoryPort) {}

  async execute(command: ApproveTransferRequestCommand): Promise<TransferRequest> {
    const request = await this.requests.findById(command.requestId);
    if (!request) throw new TransferRequestNotFoundError();
    request.approve({ approvedBy: command.approvedBy, approvedQuantities: command.approvedQuantities });
    await this.requests.save(request);
    return request;
  }
}
