import { randomUUID } from "node:crypto";
import { DriverNameRequiredError, UnknownDriverStatusError } from "./errors";

export const DRIVER_STATUSES = ["AVAILABLE", "BUSY", "OFF_DUTY", "SUSPENDED", "INACTIVE"] as const;
export type DriverStatus = (typeof DRIVER_STATUSES)[number];

export interface DriverProps {
  name: string;
  phone: string | null;
  branchId: string;
  status: DriverStatus;
  legacyDriverId: number | null;
  createdAt: Date;
}

// Driver - نفس مفهوم drivers في الريبو القديم، بس مبسّط: من غير ربط user_id/employee_id (Identity/HR)
// لسه - راجع تعليق delivery.module.ts للسلايس المؤجّل (driver_settlements/driver_shifts)
export class Driver {
  private constructor(
    public readonly id: string,
    private props: DriverProps
  ) {}

  static register(input: { name: string; phone?: string | null; branchId: string; legacyDriverId?: number | null }): Driver {
    const name = input.name.trim();
    if (!name) throw new DriverNameRequiredError();

    return new Driver(randomUUID(), {
      name,
      phone: input.phone ?? null,
      branchId: input.branchId,
      status: "AVAILABLE",
      legacyDriverId: input.legacyDriverId ?? null,
      createdAt: new Date(),
    });
  }

  static reconstitute(id: string, props: DriverProps): Driver {
    return new Driver(id, props);
  }

  changeStatus(status: string): void {
    if (!DRIVER_STATUSES.includes(status as DriverStatus)) throw new UnknownDriverStatusError(status);
    this.props.status = status as DriverStatus;
  }

  get name(): string { return this.props.name; }
  get phone(): string | null { return this.props.phone; }
  get branchId(): string { return this.props.branchId; }
  get status(): DriverStatus { return this.props.status; }
  get legacyDriverId(): number | null { return this.props.legacyDriverId; }
  get createdAt(): Date { return this.props.createdAt; }
}
