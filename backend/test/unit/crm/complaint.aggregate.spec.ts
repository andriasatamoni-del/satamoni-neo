import { Complaint } from "../../../src/contexts/crm/domain/complaint.aggregate";
import { UnknownComplaintCategoryError, UnknownComplaintStatusError } from "../../../src/contexts/crm/domain/errors";

describe("Complaint aggregate", () => {
  describe("register", () => {
    it("بيسجّل شكوى صحيحة بحالة open افتراضية", () => {
      const complaint = Complaint.register({
        channel: "phone_followup",
        customerPhone: "01000000000",
        category: "late_order",
        createdBy: "user-1",
      });
      expect(complaint.status).toBe("open");
      expect(complaint.resolvedAt).toBeNull();
      expect(complaint.resolvedBy).toBeNull();
    });

    it("لو اتسجّلت resolved من الأول، بتتحط resolvedBy/resolvedAt فورًا", () => {
      const complaint = Complaint.register({
        channel: "phone_followup",
        customerPhone: "01000000000",
        category: "quality",
        status: "resolved",
        createdBy: "user-1",
      });
      expect(complaint.status).toBe("resolved");
      expect(complaint.resolvedBy).toBe("user-1");
      expect(complaint.resolvedAt).not.toBeNull();
    });

    it("بيرفض نوع شكوى مش معروف", () => {
      expect(() =>
        Complaint.register({ channel: "whatsapp", customerPhone: "01000000000", category: "ghost" })
      ).toThrow(UnknownComplaintCategoryError);
    });

    it("بيرفض حالة مش معروفة", () => {
      expect(() =>
        Complaint.register({
          channel: "whatsapp",
          customerPhone: "01000000000",
          category: "other",
          status: "ghost",
        })
      ).toThrow(UnknownComplaintStatusError);
    });
  });

  describe("updateStatus", () => {
    it("بيحط resolvedBy/resolvedAt وقت الانتقال لـresolved", () => {
      const complaint = Complaint.register({ channel: "whatsapp", customerPhone: "01000000000", category: "other" });
      complaint.updateStatus({ status: "resolved", actingUserId: "manager-1" });
      expect(complaint.status).toBe("resolved");
      expect(complaint.resolvedBy).toBe("manager-1");
      expect(complaint.resolvedAt).not.toBeNull();
    });

    // تحسين متعمد عن الريبو القديم (routes/crm.js): لما شكوى resolved ترجع تتفتح تاني،
    // resolvedBy/resolvedAt بيتصفروا بدل ما يفضلوا عالقين من الحل القديم
    it("بيصفّر resolvedBy/resolvedAt لو الشكوى اترجعت اتفتحت تاني بعد ما كانت resolved", () => {
      const complaint = Complaint.register({ channel: "whatsapp", customerPhone: "01000000000", category: "other" });
      complaint.updateStatus({ status: "resolved", actingUserId: "manager-1" });
      complaint.updateStatus({ status: "in_progress" });
      expect(complaint.status).toBe("in_progress");
      expect(complaint.resolvedBy).toBeNull();
      expect(complaint.resolvedAt).toBeNull();
    });

    it("بيحدّث resolutionNotes من غير ما يلمس الحالة لو الحالة مش مبعوتة", () => {
      const complaint = Complaint.register({ channel: "whatsapp", customerPhone: "01000000000", category: "other" });
      complaint.updateStatus({ resolutionNotes: "اتحل بمكالمة" });
      expect(complaint.status).toBe("open");
      expect(complaint.resolutionNotes).toBe("اتحل بمكالمة");
    });

    it("بيرفض حالة مش معروفة ومايغيّرش الحالة الحالية", () => {
      const complaint = Complaint.register({ channel: "whatsapp", customerPhone: "01000000000", category: "other" });
      expect(() => complaint.updateStatus({ status: "ghost" })).toThrow(UnknownComplaintStatusError);
      expect(complaint.status).toBe("open");
    });
  });

  describe("assign", () => {
    it("بيحدّث assignedTo", () => {
      const complaint = Complaint.register({ channel: "whatsapp", customerPhone: "01000000000", category: "other" });
      complaint.assign("agent-1");
      expect(complaint.assignedTo).toBe("agent-1");
    });
  });
});
