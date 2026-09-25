import { randomUUID } from "node:crypto";
import {
  CustomerAccountAlreadyExistsError,
  CustomerAddressRequiredError,
  CustomerNameRequiredError,
  InvalidPhoneError,
  WeakCustomerPasswordError,
} from "./errors";

const PHONE_RE = /^\d{8,15}$/;
const MIN_PASSWORD_LENGTH = 6;

export function normalizePhone(raw: string): string {
  return String(raw ?? "").replace(/[\s-]/g, "");
}

export interface CustomerAddress {
  id: string;
  label: string | null;
  addressDetails: string;
  distinguishingMark: string | null;
  isDefault: boolean;
  createdAt: Date;
}

export interface CustomerProps {
  phone: string;
  phone2: string | null;
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

// Customer - نفس مفهوم customers+customer_addresses في الريبو القديم (المرحلة 8.38): حساب اختياري
// بالكامل لموقع الطلب أونلاين - رقم تليفون + كلمة سر. passwordHash=null يعني عميل "ضيف" (سجّل طلب من
// غير حساب) - عنوانه/نقاط ولائه المتراكمة بتفضل محفوظة، وممكن يتحول لحساب حقيقي بعدين (activateAccount)
// من غير ما يفقد أي حاجة. حظر العميل (isBlocked) بيانات مرجعية بس هنا - مفيش مسار طلب عام في neo لسه
// يستهلكها (راجع خطة إعادة البناء - الطلبات هنا POS داخلي بس، الموقع العام مؤجّل)
export class Customer {
  private constructor(
    public readonly id: string,
    private props: CustomerProps
  ) {}

  static register(input: {
    phone: string;
    name: string;
    passwordHash: string;
    legacyCustomerId?: number | null;
  }): Customer {
    const phone = normalizePhone(input.phone);
    if (!PHONE_RE.test(phone)) throw new InvalidPhoneError();
    const name = input.name.trim();
    if (!name) throw new CustomerNameRequiredError();

    return new Customer(randomUUID(), {
      phone,
      phone2: null,
      name,
      addressDetails: null,
      distinguishingMark: null,
      notes: null,
      loyaltyPoints: 0,
      passwordHash: input.passwordHash,
      isBlocked: false,
      blockReason: null,
      blockedBy: null,
      blockedAt: null,
      addresses: [],
      legacyCustomerId: input.legacyCustomerId ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  static reconstitute(id: string, props: CustomerProps): Customer {
    return new Customer(id, props);
  }

  static validatePasswordPolicy(plainText: string): void {
    if (plainText.length < MIN_PASSWORD_LENGTH) throw new WeakCustomerPasswordError(MIN_PASSWORD_LENGTH);
  }

  // بيحوّل عميل ضيف (مسجّل قبل كده من طلب، من غير حساب) لحساب حقيقي - بياناته القديمة (نقاط الولاء،
  // العنوان المحفوظ) بتفضل زي ما هي، مش بنبدأ من صفر. نفس فلسفة ON CONFLICT DO UPDATE بالريبو القديم
  // بالظبط، بس كقاعدة دومين صريحة
  activateAccount(input: { name: string; passwordHash: string }): void {
    if (this.props.passwordHash) throw new CustomerAccountAlreadyExistsError();
    const name = input.name.trim();
    if (!name) throw new CustomerNameRequiredError();
    this.props.name = name;
    this.props.passwordHash = input.passwordHash;
    this.props.updatedAt = new Date();
  }

  changePasswordHash(passwordHash: string): void {
    this.props.passwordHash = passwordHash;
    this.props.updatedAt = new Date();
  }

  updateProfile(input: {
    name?: string;
    phone2?: string | null;
    addressDetails?: string | null;
    distinguishingMark?: string | null;
    notes?: string | null;
  }): void {
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new CustomerNameRequiredError();
      this.props.name = name;
    }
    if (input.phone2 !== undefined) this.props.phone2 = input.phone2;
    if (input.addressDetails !== undefined) this.props.addressDetails = input.addressDetails;
    if (input.distinguishingMark !== undefined) this.props.distinguishingMark = input.distinguishingMark;
    if (input.notes !== undefined) this.props.notes = input.notes;
    this.props.updatedAt = new Date();
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

  // دفتر عناوين العميل - نفس فلسفة customer_addresses بالريبو القديم بالظبط: عنوان جديد بـisDefault=true
  // بيشيل الافتراضي عن الباقي (افتراضي واحد بس في أي وقت)
  addAddress(input: { label?: string | null; addressDetails: string; distinguishingMark?: string | null; isDefault?: boolean }): CustomerAddress {
    const addressDetails = input.addressDetails.trim();
    if (!addressDetails) throw new CustomerAddressRequiredError();
    const address: CustomerAddress = {
      id: randomUUID(),
      label: input.label ?? null,
      addressDetails,
      distinguishingMark: input.distinguishingMark ?? null,
      isDefault: !!input.isDefault,
      createdAt: new Date(),
    };
    if (address.isDefault) this.props.addresses.forEach((a) => (a.isDefault = false));
    this.props.addresses.push(address);
    this.props.updatedAt = new Date();
    return address;
  }

  get phone(): string { return this.props.phone; }
  get phone2(): string | null { return this.props.phone2; }
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
