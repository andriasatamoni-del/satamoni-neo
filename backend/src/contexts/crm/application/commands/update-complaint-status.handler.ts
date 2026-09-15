import { Inject, Injectable } from "@nestjs/common";
import { Complaint } from "../../domain/complaint.aggregate";
import { COMPLAINT_REPOSITORY, type ComplaintRepositoryPort } from "../../domain/ports/complaint-repository.port";
import { ComplaintNotFoundError, NoUpdateFieldsProvidedError } from "../../domain/errors";

export interface UpdateComplaintStatusCommand {
  complaintId: string;
  status?: string;
  resolutionNotes?: string | null;
  actingUserId: string;
}

// نفس منطق PATCH /api/crm/complaints/:id في الريبو القديم، بس بتصفير resolvedBy/resolvedAt لو الشكوى
// اترجعت اتفتحت تاني بعد ما كانت resolved (راجع تعليق Complaint.updateStatus - تحسين متعمد)
@Injectable()
export class UpdateComplaintStatusHandler {
  constructor(@Inject(COMPLAINT_REPOSITORY) private readonly complaints: ComplaintRepositoryPort) {}

  async execute(command: UpdateComplaintStatusCommand): Promise<Complaint> {
    if (command.status === undefined && command.resolutionNotes === undefined) {
      throw new NoUpdateFieldsProvidedError();
    }
    const complaint = await this.complaints.findById(command.complaintId);
    if (!complaint) throw new ComplaintNotFoundError();

    complaint.updateStatus({
      status: command.status,
      resolutionNotes: command.resolutionNotes,
      actingUserId: command.actingUserId,
    });
    await this.complaints.save(complaint);
    return complaint;
  }
}
