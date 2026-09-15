import { randomUUID } from "node:crypto";
import { UnknownComplaintCategoryError, UnknownComplaintStatusError } from "./errors";

export const CHANNELS = ["phone_followup", "whatsapp"] as const;
export type ComplaintChannel = (typeof CHANNELS)[number];

export const CATEGORIES = ["late_order", "wrong_item", "quality", "other"] as const;
export type ComplaintCategory = (typeof CATEGORIES)[number];

export const STATUSES = ["open", "in_progress", "resolved"] as const;
export type ComplaintStatus = (typeof STATUSES)[number];

export interface ComplaintProps {
  channel: ComplaintChannel;
  legacyOrderId: number | null;
  branchId: string | null;
  followupId: string | null;
  customerPhone: string;
  category: ComplaintCategory;
  description: string | null;
  status: ComplaintStatus;
  resolutionNotes: string | null;
  createdBy: string | null;
  assignedTo: string | null;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  legacyComplaintId: number | null;
  legacySource: "customer_complaints" | "whatsapp_complaints" | null;
}

// Complaint aggregate - بيوحّد customer_complaints (اللي جاية من مكالمة متابعة تليفونية) وwhatsapp_
// complaints (اللي جاية من بوت الواتساب) في aggregate واحد بعمود channel، بدل جدولين شبه متطابقين في
// الريبو القديم (راجع migration 002_create_crm_tables). تحسين متعمد عن الريبو القديم: لما الشكوى
// بترجع تفتح تاني بعد ما كانت resolved، resolvedBy/resolvedAt بيتصفروا (في الريبو القديم كانوا فاضلين
// عالقين حتى بعد إعادة الفتح - راجع routes/crm.js PATCH /complaints/:id).
export class Complaint {
  private constructor(
    public readonly id: string,
    private props: ComplaintProps
  ) {}

  static register(input: {
    channel: ComplaintChannel;
    legacyOrderId?: number | null;
    branchId?: string | null;
    followupId?: string | null;
    customerPhone: string;
    category: string;
    description?: string | null;
    status?: string;
    resolutionNotes?: string | null;
    createdBy?: string | null;
    assignedTo?: string | null;
    legacyComplaintId?: number | null;
    legacySource?: "customer_complaints" | "whatsapp_complaints" | null;
  }): Complaint {
    if (!CATEGORIES.includes(input.category as ComplaintCategory)) {
      throw new UnknownComplaintCategoryError(input.category);
    }
    const status = input.status ?? "open";
    if (!STATUSES.includes(status as ComplaintStatus)) {
      throw new UnknownComplaintStatusError(status);
    }

    const now = new Date();
    const isResolved = status === "resolved";
    return new Complaint(randomUUID(), {
      channel: input.channel,
      legacyOrderId: input.legacyOrderId ?? null,
      branchId: input.branchId ?? null,
      followupId: input.followupId ?? null,
      customerPhone: input.customerPhone,
      category: input.category as ComplaintCategory,
      description: input.description ?? null,
      status: status as ComplaintStatus,
      resolutionNotes: input.resolutionNotes ?? null,
      createdBy: input.createdBy ?? null,
      assignedTo: input.assignedTo ?? null,
      resolvedBy: isResolved ? (input.createdBy ?? null) : null,
      resolvedAt: isResolved ? now : null,
      createdAt: now,
      legacyComplaintId: input.legacyComplaintId ?? null,
      legacySource: input.legacySource ?? null,
    });
  }

  static reconstitute(id: string, props: ComplaintProps): Complaint {
    return new Complaint(id, props);
  }

  assign(userId: string): void {
    this.props.assignedTo = userId;
  }

  updateStatus(input: { status?: string; resolutionNotes?: string | null; actingUserId?: string | null }): void {
    if (input.status !== undefined) {
      if (!STATUSES.includes(input.status as ComplaintStatus)) {
        throw new UnknownComplaintStatusError(input.status);
      }
      const wasResolved = this.props.status === "resolved";
      const nowResolved = input.status === "resolved";
      this.props.status = input.status as ComplaintStatus;
      if (nowResolved && !wasResolved) {
        this.props.resolvedBy = input.actingUserId ?? null;
        this.props.resolvedAt = new Date();
      } else if (!nowResolved && wasResolved) {
        this.props.resolvedBy = null;
        this.props.resolvedAt = null;
      }
    }
    if (input.resolutionNotes !== undefined) {
      this.props.resolutionNotes = input.resolutionNotes;
    }
  }

  get channel(): ComplaintChannel { return this.props.channel; }
  get legacyOrderId(): number | null { return this.props.legacyOrderId; }
  get branchId(): string | null { return this.props.branchId; }
  get followupId(): string | null { return this.props.followupId; }
  get customerPhone(): string { return this.props.customerPhone; }
  get category(): ComplaintCategory { return this.props.category; }
  get description(): string | null { return this.props.description; }
  get status(): ComplaintStatus { return this.props.status; }
  get resolutionNotes(): string | null { return this.props.resolutionNotes; }
  get createdBy(): string | null { return this.props.createdBy; }
  get assignedTo(): string | null { return this.props.assignedTo; }
  get resolvedBy(): string | null { return this.props.resolvedBy; }
  get resolvedAt(): Date | null { return this.props.resolvedAt; }
  get createdAt(): Date { return this.props.createdAt; }
  get legacyComplaintId(): number | null { return this.props.legacyComplaintId; }
  get legacySource(): "customer_complaints" | "whatsapp_complaints" | null { return this.props.legacySource; }
}
