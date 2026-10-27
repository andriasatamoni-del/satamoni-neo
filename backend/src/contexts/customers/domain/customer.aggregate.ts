import { randomUUID } from "node:crypto";
import {
  CustomerAccountAlreadyExistsError,
  CustomerAddressFieldRequiredError,
  CustomerAddressNotFoundError,
  CustomerAddressRequiredError,
  InvalidEmailError,
  SecondPhoneRequiredError,
  CustomerNameRequiredError,
  CustomerPhoneAlreadyAddedError,
  CustomerPhoneNotFoundError,
  InvalidPhoneError,
  WeakCustomerPasswordError,
} from "./errors";

const PHONE_RE = /^\d{8,15}$/;
const MIN_PASSWORD_LENGTH = 6;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(raw: string): string {
  return String(raw ?? "").trim().toLowerCase();
}
function validateContact(phone: string, input: { email: string; phone2: string }): { email: string; phone2: string } {
  const email = normalizeEmail(input.email);
  if (!EMAIL_RE.test(email) || email.length > 120) throw new InvalidEmailError();
  const phone2 = normalizePhone(input.phone2);
  if (!PHONE_RE.test(phone2)) throw new InvalidPhoneError();
  if (phone2 === phone) throw new SecondPhoneRequiredError();
  return { email, phone2 };
}
export interface StructuredAddressInput {
  label?: string | null;
  area: string;
  street: string;
  building: string;
  floor: string;
  apartment: string;
  distinguishingMark?: string | null;
  isDefault?: boolean;
}

const ADDRESS_FIELDS: { key: "area" | "street" | "building" | "floor" | "apartment"; label: string }[] = [
  { key: "area", label: "المنطقة" },
  { key: "street", label: "اسم الشارع" },
  { key: "building", label: "رقم العمارة" },
  { key: "floor", label: "الدور" },
  { key: "apartment", label: "رقم الشقة" },
];

export function composeAddress(a: { area: string; street: string; building: string; floor: string; apartment: string }): string {
  return `${a.area} - ${a.street} - عمارة ${a.building} - الدور ${a.floor} - شقة ${a.apartment}`;
}

export function normalizePhone(raw: string): string {
  return String(raw ?? "").replace(/[\s-]/g, "");
}

export function parsePhone(raw: string): string {
  const phone = normalizePhone(raw);
  if (!PHONE_RE.test(phone)) throw new InvalidPhoneError();
  return phone;
}

export interface CustomerPhone {
  id: string;
  phone: string;
  label: string | null;
  isPrimary: boolean;
  createdAt: Date;
}

function newPhone(phone: string, isPrimary: boolean, label: string | null = null): CustomerPhone {
  return { id: randomUUID(), phone, label, isPrimary, createdAt: new Date() };
}

export interface CustomerAddress {
  id: string;
  label: string | null;
  addressDetails: string;
  area: string | null;
  street: string | null;
  building: string | null;
  floor: string | null;
  apartment: string | null;
  distinguishingMark: string | null;
  isDefault: boolean;
  createdAt: Date;
}

export interface CustomerProps {
  phones: CustomerPhone[];
  email: string | null;
  name: string | null;
  addressDetails: string | null;
  distinguishingMark: string | null;
  notes: string | null;
  loyaltyPoints: number;
  passwordHash: string | null;
  isBlocked: boolean;
  blockReason: string | null;
  blockedBy: string | null;
  blockedAt: Date | null;
  addresses: CustomerAddress[];
  legacyCustomerId: number | null;
  createdAt: Date;
  updatedAt: Date;
}
export class Customer {
  private constructor(
    public readonly id: string,
    private props: CustomerProps
  ) {}
  static register(input: {
    phone: string;
    phone2: string;
    email: string;
    name: string;
    passwordHash: string;
    legacyCustomerId?: number | null;
  }): Customer {
    const phone = parsePhone(input.phone);
    const name = input.name.trim();
    if (!name) throw new CustomerNameRequiredError();
    const contact = validateContact(phone, input);

    return Customer.create({
      phones: [newPhone(phone, true), newPhone(contact.phone2, false)],
      email: contact.email,
      name,
      passwordHash: input.passwordHash,
      legacyCustomerId: input.legacyCustomerId ?? null,
    });
  }

  static registerByStaff(input: {
    name: string;
    phone: string;
    extraPhones?: { phone: string; label?: string | null }[];
    addresses?: StructuredAddressInput[];
  }): Customer {
    const name = input.name.trim();
    if (!name) throw new CustomerNameRequiredError();
    const customer = Customer.create({
      phones: [newPhone(parsePhone(input.phone), true)],
      email: null,
      name,
      passwordHash: null,
      legacyCustomerId: null,
    });
    for (const extra of input.extraPhones ?? []) customer.addPhone(extra);
    for (const address of input.addresses ?? []) customer.addAddress(address);
    return customer;
  }

  private static create(input: {
    phones: CustomerPhone[];
    email: string | null;
    name: string;
    passwordHash: string | null;
    legacyCustomerId: number | null;
  }): Customer {
    return new Customer(randomUUID(), {
      ...input,
      addressDetails: null,
      distinguishingMark: null,
      notes: null,
      loyaltyPoints: 0,
      isBlocked: false,
      blockReason: null,
      blockedBy: null,
      blockedAt: null,
      addresses: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  static reconstitute(id: string, props: CustomerProps): Customer {
    return new Customer(id, props);
  }

  static phonesFromLegacyColumns(phone: string, phone2: string | null, createdAt: Date): CustomerPhone[] {
    const phones: CustomerPhone[] = [{ ...newPhone(phone, true), createdAt }];
    if (phone2 && phone2 !== phone) phones.push({ ...newPhone(phone2, false), createdAt });
    return phones;
  }

  static validatePasswordPolicy(plainText: string): void {
    if (plainText.length < MIN_PASSWORD_LENGTH) throw new WeakCustomerPasswordError(MIN_PASSWORD_LENGTH);
  }
  activateAccount(input: { name: string; passwordHash: string; email: string; phone2: string }): void {
    if (this.props.passwordHash) throw new CustomerAccountAlreadyExistsError();
    const name = input.name.trim();
    if (!name) throw new CustomerNameRequiredError();
    const contact = validateContact(this.phone, input);
    this.props.name = name;
    this.props.email = contact.email;
    this.setSecondPhone(contact.phone2);
    this.props.passwordHash = input.passwordHash;
    this.props.updatedAt = new Date();
  }

  changePasswordHash(passwordHash: string): void {
    this.props.passwordHash = passwordHash;
    this.props.updatedAt = new Date();
  }

  updateProfile(input: {
    name?: string;
    addressDetails?: string | null;
    distinguishingMark?: string | null;
    notes?: string | null;
  }): void {
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new CustomerNameRequiredError();
      this.props.name = name;
    }
    if (input.addressDetails !== undefined) this.props.addressDetails = input.addressDetails;
    if (input.distinguishingMark !== undefined) this.props.distinguishingMark = input.distinguishingMark;
    if (input.notes !== undefined) this.props.notes = input.notes;
    this.props.updatedAt = new Date();
  }
  updateContact(input: { name?: string; email?: string; phone2?: string }): void {
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new CustomerNameRequiredError();
      this.props.name = name;
    }
    if (input.email !== undefined || input.phone2 !== undefined) {
      const contact = validateContact(this.phone, {
        email: input.email ?? this.props.email ?? "",
        phone2: input.phone2 ?? this.phone2 ?? "",
      });
      this.props.email = contact.email;
      this.setSecondPhone(contact.phone2);
    }
    this.props.updatedAt = new Date();
  }

  addPhone(input: { phone: string; label?: string | null }): CustomerPhone {
    const phone = parsePhone(input.phone);
    if (this.hasPhone(phone)) throw new CustomerPhoneAlreadyAddedError();
    const entry = newPhone(phone, false, input.label?.trim() || null);
    this.props.phones.push(entry);
    this.props.updatedAt = new Date();
    return entry;
  }

  hasPhone(phone: string): boolean {
    const normalized = normalizePhone(phone);
    return this.props.phones.some((p) => p.phone === normalized);
  }

  private setSecondPhone(phone: string): void {
    if (this.phone2 === phone) return;
    this.props.phones = this.props.phones.filter((p) => p.isPrimary || p.phone !== phone);
    const second = this.props.phones.find((p) => !p.isPrimary);
    if (second) second.phone = phone;
    else this.props.phones.push(newPhone(phone, false));
  }

  addLoyaltyPoints(points: number): void {
    this.props.loyaltyPoints += points;
    this.props.updatedAt = new Date();
  }

  block(input: { reason?: string | null; blockedBy: string | null }): void {
    this.props.isBlocked = true;
    this.props.blockReason = input.reason ?? null;
    this.props.blockedBy = input.blockedBy;
    this.props.blockedAt = new Date();
    this.props.updatedAt = new Date();
  }

  unblock(): void {
    this.props.isBlocked = false;
    this.props.blockReason = null;
    this.props.blockedBy = null;
    this.props.blockedAt = null;
    this.props.updatedAt = new Date();
  }
  addAddress(input: StructuredAddressInput): CustomerAddress {
    const fields = {} as Record<(typeof ADDRESS_FIELDS)[number]["key"], string>;
    for (const f of ADDRESS_FIELDS) {
      const value = String(input[f.key] ?? "").trim();
      if (!value) throw new CustomerAddressFieldRequiredError(f.label);
      if (value.length > 120) throw new CustomerAddressRequiredError();
      fields[f.key] = value;
    }
    const address: CustomerAddress = {
      id: randomUUID(),
      label: input.label?.trim() || null,
      addressDetails: composeAddress(fields),
      ...fields,
      distinguishingMark: input.distinguishingMark?.trim() || null,
      isDefault: !!input.isDefault || this.props.addresses.length === 0,
      createdAt: new Date(),
    };
    if (address.isDefault) this.props.addresses.forEach((a) => (a.isDefault = false));
    this.props.addresses.push(address);
    this.props.addressDetails = address.isDefault ? address.addressDetails : this.props.addressDetails;
    this.props.updatedAt = new Date();
    return address;
  }

  removeAddress(addressId: string): void {
    const index = this.props.addresses.findIndex((a) => a.id === addressId);
    if (index === -1) throw new CustomerAddressNotFoundError();
    const [removed] = this.props.addresses.splice(index, 1);
    if (removed.isDefault && this.props.addresses.length > 0) this.props.addresses[0].isDefault = true;
    this.props.updatedAt = new Date();
  }

  setDefaultAddress(addressId: string): void {
    const target = this.props.addresses.find((a) => a.id === addressId);
    if (!target) throw new CustomerAddressNotFoundError();
    this.props.addresses.forEach((a) => (a.isDefault = a.id === addressId));
    this.props.addressDetails = target.addressDetails;
    this.props.updatedAt = new Date();
  }

  findAddress(addressId: string): CustomerAddress | undefined {
    return this.props.addresses.find((a) => a.id === addressId);
  }
  orderContact(input: { phone?: string | null; addressId?: string | null }): {
    customerName: string | null;
    customerPhone: string;
    addressDetails: string | null;
  } {
    const requestedPhone = input.phone ? normalizePhone(input.phone) : null;
    if (requestedPhone && !this.hasPhone(requestedPhone)) throw new CustomerPhoneNotFoundError();
    let addressDetails: string | null = null;
    if (input.addressId) {
      const address = this.findAddress(input.addressId);
      if (!address) throw new CustomerAddressNotFoundError();
      addressDetails = [address.addressDetails, address.distinguishingMark && `علامة مميزة: ${address.distinguishingMark}`]
        .filter(Boolean)
        .join(" - ");
    }
    return { customerName: this.name, customerPhone: requestedPhone ?? this.phone, addressDetails };
  }

  get missingProfileFields(): string[] {
    const missing: string[] = [];
    if (!this.props.email) missing.push("email");
    if (!this.phone2) missing.push("phone2");
    if (this.props.addresses.length === 0) missing.push("address");
    return missing;
  }

  get phone(): string { return this.props.phones.find((p) => p.isPrimary)!.phone; }
  get phone2(): string | null { return this.props.phones.find((p) => !p.isPrimary)?.phone ?? null; }
  get phones(): readonly CustomerPhone[] { return this.props.phones; }
  get email(): string | null { return this.props.email; }
  get name(): string | null { return this.props.name; }
  get addressDetails(): string | null { return this.props.addressDetails; }
  get distinguishingMark(): string | null { return this.props.distinguishingMark; }
  get notes(): string | null { return this.props.notes; }
  get loyaltyPoints(): number { return this.props.loyaltyPoints; }
  get passwordHash(): string | null { return this.props.passwordHash; }
  get hasAccount(): boolean { return this.props.passwordHash !== null; }
  get isBlocked(): boolean { return this.props.isBlocked; }
  get blockReason(): string | null { return this.props.blockReason; }
  get blockedBy(): string | null { return this.props.blockedBy; }
  get blockedAt(): Date | null { return this.props.blockedAt; }
  get addresses(): readonly CustomerAddress[] { return this.props.addresses; }
  get legacyCustomerId(): number | null { return this.props.legacyCustomerId; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }
}
