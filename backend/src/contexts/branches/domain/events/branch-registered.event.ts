import { DomainEvent } from "../../../../shared/events/domain-event";

// بينشر لما فرع جديد يتسجّل - المستهلك الحالي: Treasury context (بينشئ خزينة رئيسية MAIN تلقائيًا لكل
// فرع جديد، نفس فلسفة الريبو القديم بالظبط - مفيش endpoint عام لإنشاء خزينة MAIN يدويًا، بتتربط
// بالفرع نفسه من لحظة إنشائه)
export class BranchRegisteredEvent extends DomainEvent {
  readonly eventName = "BranchRegistered";

  constructor(
    public readonly branchId: string,
    public readonly name: string
  ) {
    super();
  }
}
