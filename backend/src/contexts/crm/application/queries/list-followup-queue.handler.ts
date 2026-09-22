import { Inject, Injectable } from "@nestjs/common";
import { FOLLOWUP_QUEUE_READER, type FollowupQueueReaderPort, type FollowupQueueRow } from "../../domain/ports/followup-queue-reader.port";

@Injectable()
export class ListFollowupQueueHandler {
  constructor(@Inject(FOLLOWUP_QUEUE_READER) private readonly reader: FollowupQueueReaderPort) {}

  execute(branchId?: string): Promise<FollowupQueueRow[]> {
    return this.reader.listQueue(branchId);
  }
}
