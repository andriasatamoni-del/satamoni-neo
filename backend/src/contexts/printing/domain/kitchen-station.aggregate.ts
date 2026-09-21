import { randomUUID } from "node:crypto";
import { KitchenStationNameRequiredError } from "./errors";

export interface KitchenStationProps {
  branchId: string;
  name: string;
  printerId: string | null;
  isActive: boolean;
  createdAt: Date;
}

// KitchenStation - نفس مفهوم kitchen_stations في الريبو القديم: طبقة الوسيط الصريحة بين "صنف/قسم
// المنيو" و"الطابعة الفعلية" (Menu Item/Category -> Station -> Printer)، عشان تغيير مين بيطبع فين يكون
// من الإعدادات مش تعديل كود. محطة واحدة لها طابعة واحدة بس في كل فرع (مفيش جدول وسيط زيادة).
export class KitchenStation {
  private constructor(
    public readonly id: string,
    private props: KitchenStationProps
  ) {}

  static register(input: { branchId: string; name: string; printerId?: string | null }): KitchenStation {
    const name = input.name.trim();
    if (!name) throw new KitchenStationNameRequiredError();
    return new KitchenStation(randomUUID(), {
      branchId: input.branchId,
      name,
      printerId: input.printerId ?? null,
      isActive: true,
      createdAt: new Date(),
    });
  }

  static reconstitute(id: string, props: KitchenStationProps): KitchenStation {
    return new KitchenStation(id, props);
  }

  update(input: { name?: string; printerId?: string | null; isActive?: boolean }): void {
    if (input.name !== undefined) {
      const trimmed = input.name.trim();
      if (!trimmed) throw new KitchenStationNameRequiredError();
      this.props.name = trimmed;
    }
    if (input.printerId !== undefined) this.props.printerId = input.printerId;
    if (input.isActive !== undefined) this.props.isActive = input.isActive;
  }

  get branchId(): string { return this.props.branchId; }
  get name(): string { return this.props.name; }
  get printerId(): string | null { return this.props.printerId; }
  get isActive(): boolean { return this.props.isActive; }
  get createdAt(): Date { return this.props.createdAt; }
}
