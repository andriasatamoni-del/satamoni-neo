import { randomUUID } from "node:crypto";
import {
  CustomerAccountAlreadyExistsError,
  CustomerAddressFieldRequiredError,
  CustomerAddressNotFoundError,
  CustomerAddressRequiredError,
  InvalidEmailError,
  SecondPhoneRequiredError,
  CustomerNameRequiredError,
  InvalidPhoneError,
  WeakCustomerPasswordError,
} from "./errors";

const PHONE_RE = /^\d{8,15}$/;
const MIN_PASSWORD_LENGTH = 6;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(raw: string): string {
  return String(raw ?? "").trim().toLowerCase();
}

// بيانات التواصل الإلزامية لحساب الطلب أونلاين (STORE-2): إيميل صالح + رقم تاني صالح ومختلف عن الأساسي
function validateContact(phone: string, input: { email: string; phone2: string }): { email: string; phone2: string } {
  const email = normalizeEmail(input.email);
  if (!EMAIL_RE.test(email) || email.length > 120) throw new InvalidEmailError();
  const phone2 = normalizePhone(input.phone2);
  if (!PHONE_RE.test(phone2)) throw new InvalidPhoneError();
  if (phone2 === phone) throw new SecondPhoneRequiredError();
  return { email, phone2 };
}

// العنوان المقسّم - كل الحقول إلزامية ما عدا اسم العنوان والعلامة المميزة
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

export interface CustomerAddress {
  id: string;
  label: string | null;
  // النص الكامل (للطيار والطباعة) - للعناوين الجديدة بيتجمّع من الحقول المقسّمة تحت؛ العناوين المستوردة
  // من القديم نص بس والحقول المقسّمة null
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
  phone: string;
  phone2: string | null;
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

  // حساب جديد للطلب أونلاين: الاسم + التليفونين + الإيميل إلزاميين، والعنوان الأول بيتضاف بعدها بـaddAddress
  static register(input: {
    phone: string;
    phone2: string;
    email: string;
    name: string;
    passwordHash: string;
    legacyCustomerId?: number | null;
  }): Customer {
    const phone = normalizePhone(input.phone);
    if (!PHONE_RE.test(phone)) throw new InvalidPhoneError();
    const name = input.name.trim();
    if (!name) throw new CustomerNameRequiredError();
    const contact = validateContact(phone, input);

    return new Customer(randomUUID(), {
      phone,
      phone2: contact.phone2,
      email: contact.email,
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
  activateAccount(input: { name: string; passwordHash: string; email: string; phone2: string }): void {
    if (this.props.passwordHash) throw new CustomerAccountAlreadyExistsError();
    const name = input.name.trim();
    if (!name) throw new CustomerNameRequiredError();
    const contact = validateContact(this.props.phone, input);
    this.props.name = name;
    this.props.email = contact.email;
    this.props.phone2 = contact.phone2;
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

  // تعديل بيانات التواصل من "حسابي" - حساب قديم مستورد من غير إيميل/رقم تاني بيكمّلهم هنا مرة واحدة
  updateContact(input: { name?: string; email?: string; phone2?: string }): void {
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new CustomerNameRequiredError();
      this.props.name = name;
    }
    if (input.email !== undefined || input.phone2 !== undefined) {
      const contact = validateContact(this.props.phone, {
        email: input.email ?? this.props.email ?? "",
        phone2: input.phone2 ?? this.props.phone2 ?? "",
      });
      this.props.email = contact.email;
      this.props.phone2 = contact.phone2;
    }
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

  // دفتر عناوين العميل: عنوان مقسّم إلزامي. أول عنوان بيبقى الافتراضي تلقائيًا، وعنوان جديد بـisDefault
  // بيشيل الافتراضي عن الباقي (افتراضي واحد بس في أي وقت - نفس customer_addresses بالريبو القديم)
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

  // جاهز يطلب أونلاين: إيميل + رقم تاني + عنوان واحد على الأقل (الحسابات المستوردة من القديم بتكمّلهم مرة)
  get missingProfileFields(): string[] {
    const missing: string[] = [];
    if (!this.props.email) missing.push("email");
    if (!this.props.phone2) missing.push("phone2");
    if (this.props.addresses.length === 0) missing.push("address");
    return missing;
  }

  get phone(): string { return this.props.phone; }
  get phone2(): string | null { return this.props.phone2; }
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
