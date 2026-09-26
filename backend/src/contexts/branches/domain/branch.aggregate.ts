import { randomUUID } from "node:crypto";
import { BranchNameRequiredError } from "./errors";

export interface BranchProps {
  name: string;
  address: string | null;
  phone: string | null;
  hours: string | null;
  lat: number | null;
  lng: number | null;
  isCentralKitchen: boolean;
  supportsDineIn: boolean;
  legacyBranchId: number | null;
  // معرّف متجر/فرع Talabat المقابل لهذا الفرع الحقيقي - نفس مفهوم branches.talabat_branch_id بالريبو
  // القديم بالظبط (TAL-1). NULL يعني الفرع ده لسه مش مربوط بـTalabat.
  talabatBranchId: string | null;
}

// Branch - أول aggregate في context جديد مش موجود أصلًا في خريطة bounded contexts بتاعت الخطة
// (docs/ARCHITECTURE-REFERENCE.md + الخطة المعتمدة سمّوا 14 context، وBranches مكانش من ضمنهم رغم إن
// branch_id متكرر في كل حتة تقريبًا - users، CRM، وبالذات المخزون اللي جاي دلوقتي واللي محتاج فرع حقيقي
// لكل رصيد). بُني هنا كتصحيح مبكر بدل ما يتأجل الموضوع تاني وتفضل branchId في كل context تانية NULL
// للأبد. الفروع نفسها زي الريبو القديم بالظبط - مفيها is_active (مفيش مفهوم "تعطيل فرع" في الريبو
// القديم، الفروع دايمًا موجودة/شغالة).
export class Branch {
  private constructor(
    public readonly id: string,
    private props: BranchProps
  ) {}

  static register(input: {
    name: string;
    address?: string | null;
    phone?: string | null;
    hours?: string | null;
    lat?: number | null;
    lng?: number | null;
    isCentralKitchen?: boolean;
    supportsDineIn?: boolean;
    legacyBranchId?: number | null;
  }): Branch {
    const name = input.name.trim();
    if (!name) throw new BranchNameRequiredError();

    return new Branch(randomUUID(), {
      name,
      address: input.address ?? null,
      phone: input.phone ?? null,
      hours: input.hours ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      isCentralKitchen: !!input.isCentralKitchen,
      supportsDineIn: input.supportsDineIn ?? true,
      legacyBranchId: input.legacyBranchId ?? null,
      talabatBranchId: null,
    });
  }

  static reconstitute(id: string, props: BranchProps): Branch {
    return new Branch(id, props);
  }

  rename(name: string): void {
    const trimmed = name.trim();
    if (!trimmed) throw new BranchNameRequiredError();
    this.props.name = trimmed;
  }

  updateDetails(input: { address?: string | null; phone?: string | null; hours?: string | null }): void {
    if (input.address !== undefined) this.props.address = input.address;
    if (input.phone !== undefined) this.props.phone = input.phone;
    if (input.hours !== undefined) this.props.hours = input.hours;
  }

  linkTalabatBranch(talabatBranchId: string | null): void {
    this.props.talabatBranchId = talabatBranchId;
  }

  get name(): string { return this.props.name; }
  get address(): string | null { return this.props.address; }
  get phone(): string | null { return this.props.phone; }
  get hours(): string | null { return this.props.hours; }
  get lat(): number | null { return this.props.lat; }
  get lng(): number | null { return this.props.lng; }
  get isCentralKitchen(): boolean { return this.props.isCentralKitchen; }
  get supportsDineIn(): boolean { return this.props.supportsDineIn; }
  get legacyBranchId(): number | null { return this.props.legacyBranchId; }
  get talabatBranchId(): string | null { return this.props.talabatBranchId; }
}
