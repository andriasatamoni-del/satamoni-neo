import { randomUUID } from "node:crypto";
import { SupplierNameRequiredError, UnknownSupplierStatusError } from "./errors";

export const SUPPLIER_STATUSES = ["ACTIVE", "INACTIVE", "BLOCKED"] as const;
export type SupplierStatus = (typeof SUPPLIER_STATUSES)[number];

export interface SupplierProps {
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  paymentTerms: string | null;
  status: SupplierStatus;
  legacySupplierId: number | null;
  createdAt: Date;
}

// Supplier - نفس مفهوم suppliers في الريبو القديم. مفيش DELETE خالص - مورد مرتبط بمعاملات تاريخية بيتقفل
// بـstatus بس (نفس فلسفة الريبو القديم بالظبط).
export class Supplier {
  private constructor(
    public readonly id: string,
    private props: SupplierProps
  ) {}

  static register(input: {
    name: string;
    contactPerson?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    paymentTerms?: string | null;
    legacySupplierId?: number | null;
  }): Supplier {
    const name = input.name.trim();
    if (!name) throw new SupplierNameRequiredError();

    return new Supplier(randomUUID(), {
      name,
      contactPerson: input.contactPerson ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      address: input.address ?? null,
      paymentTerms: input.paymentTerms ?? null,
      status: "ACTIVE",
      legacySupplierId: input.legacySupplierId ?? null,
      createdAt: new Date(),
    });
  }

  static reconstitute(id: string, props: SupplierProps): Supplier {
    return new Supplier(id, props);
  }

  updateDetails(input: {
    contactPerson?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    paymentTerms?: string | null;
  }): void {
    if (input.contactPerson !== undefined) this.props.contactPerson = input.contactPerson;
    if (input.phone !== undefined) this.props.phone = input.phone;
    if (input.email !== undefined) this.props.email = input.email;
    if (input.address !== undefined) this.props.address = input.address;
    if (input.paymentTerms !== undefined) this.props.paymentTerms = input.paymentTerms;
  }

  changeStatus(status: string): void {
    if (!SUPPLIER_STATUSES.includes(status as SupplierStatus)) throw new UnknownSupplierStatusError(status);
    this.props.status = status as SupplierStatus;
  }

  get name(): string { return this.props.name; }
  get contactPerson(): string | null { return this.props.contactPerson; }
  get phone(): string | null { return this.props.phone; }
  get email(): string | null { return this.props.email; }
  get address(): string | null { return this.props.address; }
  get paymentTerms(): string | null { return this.props.paymentTerms; }
  get status(): SupplierStatus { return this.props.status; }
  get legacySupplierId(): number | null { return this.props.legacySupplierId; }
  get createdAt(): Date { return this.props.createdAt; }
}
