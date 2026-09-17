import { Inject, Injectable } from "@nestjs/common";
import { Complaint, type ComplaintChannel } from "../../domain/complaint.aggregate";
import { COMPLAINT_REPOSITORY, type ComplaintRepositoryPort } from "../../domain/ports/complaint-repository.port";

export interface RegisterComplaintCommand {
  channel: ComplaintChannel;
  customerPhone: string;
  category: string;
  description?: string | null;
  branchId?: string | null;
  legacyOrderId?: number | null;
  createdBy?: string | null;
}

// نفس منطق تسجيل الشكوى الموجود بالفعل جوّه RecordFollowupHandler (channel="phone_followup")، بس هنا
// مستقل ومتاح لأي قناة (channel) تانية بدون متابعة تليفونية مرتبطة بيها - المستهلك الأول: بوابة استقبال
// واتساب (channel="whatsapp"، مفيش followupId)
@Injectable()
export class RegisterComplaintHandler {
  constructor(@Inject(COMPLAINT_REPOSITORY) private readonly complaints: ComplaintRepositoryPort) {}

  async execute(command: RegisterComplaintCommand): Promise<Complaint> {
    const complaint = Complaint.register({
      channel: command.channel,
      legacyOrderId: command.legacyOrderId,
      branchId: command.branchId,
      customerPhone: command.customerPhone,
      category: command.category,
      description: command.description,
      createdBy: command.createdBy,
    });
    await this.complaints.save(complaint);
    return complaint;
  }
}
