import { randomUUID } from "node:crypto";
import { InvalidEmailError, InvalidRoleError, RolesRequiredError, WeakPasswordError } from "./errors";
import { isValidRole, ROLES, type Role } from "./role";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

export interface UserProps {
  name: string;
  email: string;
  passwordHash: string;
  roles: Role[];
  branchId: string | null;
  pinHash: string | null;
  isActive: boolean;
  legacyUserId: number | null;
  createdAt: Date;
  updatedAt: Date;
}

// User aggregate - نفس مفهوم users في الريبو القديم، بس هنا كل قاعدة عمل (إيميل صحيح، باسورد كفاية،
// دور معروف) بقت قاعدة دومين صريحة ومختبرة لوحدها (test/unit) بدل ما تكون متوزّعة بين validation
// في الراوت وCHECK constraint في القاعدة بس.
export class User {
  private constructor(
    public readonly id: string,
    private props: UserProps
  ) {}

  static register(input: {
    name: string;
    email: string;
    passwordHash: string;
    roles: readonly string[];
    branchId?: string | null;
    legacyUserId?: number | null;
  }): User {
    const email = input.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw new InvalidEmailError(input.email);

    const now = new Date();
    return new User(randomUUID(), {
      name: input.name.trim(),
      email,
      passwordHash: input.passwordHash,
      roles: User.validateRoles(input.roles),
      branchId: input.branchId ?? null,
      pinHash: null,
      isActive: true,
      legacyUserId: input.legacyUserId ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  // بيرجّع نسخة من صف قاعدة بيانات موجود بالفعل - من غير إعادة تشغيل قواعد التسجيل (الإيميل والدور
  // اتأكد منهم أصلًا وقت الإنشاء الأول)
  static reconstitute(id: string, props: UserProps): User {
    return new User(id, props);
  }

  static validatePasswordPolicy(plainText: string): void {
    if (plainText.length < MIN_PASSWORD_LENGTH) throw new WeakPasswordError();
  }

  private static validateRoles(roles: readonly string[]): Role[] {
    if (roles.length === 0) throw new RolesRequiredError();
    for (const role of roles) if (!isValidRole(role)) throw new InvalidRoleError(role);
    return ROLES.filter((r) => roles.includes(r));
  }

  changeRoles(roles: readonly string[]): void {
    this.props.roles = User.validateRoles(roles);
    this.touch();
  }

  changeBranch(branchId: string | null): void {
    this.props.branchId = branchId;
    this.touch();
  }

  setPasswordHash(passwordHash: string): void {
    this.props.passwordHash = passwordHash;
    this.touch();
  }

  setPinHash(pinHash: string | null): void {
    this.props.pinHash = pinHash;
    this.touch();
  }

  activate(): void {
    this.props.isActive = true;
    this.touch();
  }

  deactivate(): void {
    this.props.isActive = false;
    this.touch();
  }

  private touch(): void {
    this.props.updatedAt = new Date();
  }

  get name(): string { return this.props.name; }
  get email(): string { return this.props.email; }
  get passwordHash(): string { return this.props.passwordHash; }
  get roles(): readonly Role[] { return this.props.roles; }
  get branchId(): string | null { return this.props.branchId; }
  get pinHash(): string | null { return this.props.pinHash; }
  get isActive(): boolean { return this.props.isActive; }
  get legacyUserId(): number | null { return this.props.legacyUserId; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }
}
