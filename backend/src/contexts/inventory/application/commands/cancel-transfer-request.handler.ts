import { Inject, Injectable } from "@nestjs/common";
import { TransferRequest } from "../../domain/transfer-request.aggregate";
import { TRANSFER_REQUEST_REPOSITORY, type TransferRequestRepositoryPort } from "../../domain/ports/transfer-request-repository.port";
import { TransferRequestNotFoundError } from "../../domain/errors";

export interface CancelTransferRequestCommand {
  requestId: string;
  cancelledBy: string | null;
  reason: string;
}

@Injectable()
export class CancelTransferRequestHandler {
  constructor(@Inject(TRANSFER_REQUEST_REPOSITORY) private readonly requests: TransferRequestRepositoryPort) {}

  async execute(command: CancelTransferRequestCommand): Promise<TransferRequest> {
    const request = await this.requests.findById(command.requestId);
    if (!request) throw new TransferRequestNotFoundError();
    request.cancel({ cancelledBy: command.cancelledBy, reason: command.reason });
    await this.requests.save(request);
    return request;
  }
}
