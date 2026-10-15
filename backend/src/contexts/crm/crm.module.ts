import { Module } from "@nestjs/common";
import { IdentityAccessModule } from "../identity-access/identity-access.module";
import { CUSTOMER_FOLLOWUP_REPOSITORY } from "./domain/ports/customer-followup-repository.port";
import { COMPLAINT_REPOSITORY } from "./domain/ports/complaint-repository.port";
import { FOLLOWUP_QUEUE_READER } from "./domain/ports/followup-queue-reader.port";
import { CustomerFollowupRepository } from "./infrastructure/persistence/customer-followup.repository";
import { ComplaintRepository } from "./infrastructure/persistence/complaint.repository";
import { FollowupQueueReader } from "./infrastructure/persistence/followup-queue-reader";
import { RecordFollowupHandler } from "./application/commands/record-followup.handler";
import { RegisterComplaintHandler } from "./application/commands/register-complaint.handler";
import { UpdateComplaintStatusHandler } from "./application/commands/update-complaint-status.handler";
import { ListComplaintsHandler } from "./application/queries/list-complaints.handler";
import { GetLatestComplaintByPhoneHandler } from "./application/queries/get-latest-complaint-by-phone.handler";
import { ListFollowupQueueHandler } from "./application/queries/list-followup-queue.handler";
import { CrmController } from "./api/crm.controller";

@Module({
  imports: [IdentityAccessModule],
  controllers: [CrmController],
  providers: [
    { provide: CUSTOMER_FOLLOWUP_REPOSITORY, useClass: CustomerFollowupRepository },
    { provide: COMPLAINT_REPOSITORY, useClass: ComplaintRepository },
    { provide: FOLLOWUP_QUEUE_READER, useClass: FollowupQueueReader },
    RecordFollowupHandler,
    RegisterComplaintHandler,
    UpdateComplaintStatusHandler,
    ListComplaintsHandler,
    GetLatestComplaintByPhoneHandler,
    ListFollowupQueueHandler,
  ],
  exports: [RegisterComplaintHandler],
})
export class CrmModule {}
