import { Inject, Injectable } from "@nestjs/common";
import { Complaint } from "../../domain/complaint.aggregate";
import { COMPLAINT_REPOSITORY, type ComplaintRepositoryPort } from "../../domain/ports/complaint-repository.port";

// نفس GET /api/crm/customers/:phone/complaints/latest في الريبو القديم - مستخدمة وقت تحميل بروفايل
// عميل في شاشة الكول سنتر، عشان الموظف ياخد باله لو كان فيه شكوى قبل كده
@Injectable()
export class GetLatestComplaintByPhoneHandler {
  constructor(@Inject(COMPLAINT_REPOSITORY) private readonly complaints: ComplaintRepositoryPort) {}

  async execute(phone: string): Promise<Complaint | null> {
    return this.complaints.findLatestByPhone(phone);
  }
}
