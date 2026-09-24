import { Inject, Injectable } from "@nestjs/common";
import { TransferRequest } from "../../domain/transfer-request.aggregate";
import { TRANSFER_REQUEST_REPOSITORY, type TransferRequestRepositoryPort } from "../../domain/ports/transfer-request-repository.port";
import { TransferRequestNotFoundError } from "../../domain/errors";

export interface RejectTransferRequestCommand {
  requestId: string;
  rejectedBy: string | null;
  reason: string;
}

@Injectable()
export class RejectTransferRequestHandler {
  constructor(@Inject(TRANSFER_REQUEST_REPOSITORY) private readonly requests: TransferRequestRepositoryPort) {}

  async execute(command: RejectTransferRequestCommand): Promise<TransferRequest> {
    const request = await this.requests.findById(command.requestId);
    if (!request) throw new TransferRequestNotFoundError();
    request.reject({ rejectedBy: command.rejectedBy, reason: command.reason });
    await this.requests.save(request);
    return request;
  }
}
