import { randomUUID } from "node:crypto";

export interface BranchDayProps {
  branchId: string;
  businessDate: string;
  closedBy: string;
  closedAt: Date;
  totalSales: number;
  orderCount: number;
  cashVarianceTotal: number;
  managerNotes: string | null;
}

// BranchDay - نفس مفهوم branch_days في الريبو القديم: "اليوم" مفهوم ضمني (مفيش فتح صريح، اليوم مفتوح
// تلقائيًا طالما مفيش صف ليه هنا) - القفل هو الفعل الوحيد. صف واحد لكل (branchId, businessDate) -
// UNIQUE constraint في الـmigration هي الحماية الحقيقية ضد قفل مزدوج، مش الفحص في الـapplication layer
// (راجع تعليق CloseBranchDayHandler)
export class BranchDay {
  private constructor(
    public readonly id: string,
    private props: BranchDayProps
  ) {}

  static register(input: {
    branchId: string;
    businessDate: string;
    closedBy: string;
    totalSales: number;
    orderCount: number;
    cashVarianceTotal: number;
    managerNotes?: string | null;
  }): BranchDay {
    return new BranchDay(randomUUID(), {
      branchId: input.branchId,
      businessDate: input.businessDate,
      closedBy: input.closedBy,
      closedAt: new Date(),
      totalSales: input.totalSales,
      orderCount: input.orderCount,
      cashVarianceTotal: input.cashVarianceTotal,
      managerNotes: input.managerNotes ?? null,
    });
  }

  static reconstitute(id: string, props: BranchDayProps): BranchDay {
    return new BranchDay(id, props);
  }

  get branchId(): string { return this.props.branchId; }
  get businessDate(): string { return this.props.businessDate; }
  get closedBy(): string { return this.props.closedBy; }
  get closedAt(): Date { return this.props.closedAt; }
  get totalSales(): number { return this.props.totalSales; }
  get orderCount(): number { return this.props.orderCount; }
  get cashVarianceTotal(): number { return this.props.cashVarianceTotal; }
  get managerNotes(): string | null { return this.props.managerNotes; }
}
