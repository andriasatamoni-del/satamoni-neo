import { randomUUID } from "node:crypto";
import { InvalidEmailError, InvalidRoleError, WeakPasswordError } from "./errors";
import { isValidRole, type Role } from "./role";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

export interface UserProps {
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  branchId: string | null;
  permissionGrants: string[];
  permissionRevokes: string[];
  pinHash: string | null;
  isActive: boolean;
  legacyUserId: number | null;
  createdAt: Date;
  updatedAt: Date;
}

// User aggregate - نفس مفهوم users في الريبو القديم، بس هنا كل قاعدة عمل (إيميل صحيح، باسورد كفاية،
// دور معروف) بقت قاعدة دومين صريحة ومختبرة لوحدها (test/unit) بدل ما تكون متوزّعة بين validation
// في الراوت وCHECK constraint في القاعدة بس. الـpermissionGrants/permissionRevokes نفس فلسفة
// permission_grants/permission_revokes JSONB بالظبط - استثناء فردي فوق صلاحيات الدور الافتراضية،
// revoke دايمًا بيغلب.
export class User {
  private constructor(
    public readonly id: string,
    private props: UserProps
  ) {}

  static register(input: {
    name: string;
    email: string;
    passwordHash: string;
    role: string;
    branchId?: string | null;
    legacyUserId?: number | null;
  }): User {
    const email = input.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw new InvalidEmailError(input.email);
    if (!isValidRole(input.role)) throw new InvalidRoleError(input.role);

    const now = new Date();
    return new User(randomUUID(), {
      name: input.name.trim(),
      email,
      passwordHash: input.passwordHash,
      role: input.role,
      branchId: input.branchId ?? null,
      permissionGrants: [],
      permissionRevokes: [],
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

  changeRole(newRole: string): void {
    if (!isValidRole(newRole)) throw new InvalidRoleError(newRole);
    this.props.role = newRole;
    this.touch();
  }

  changeBranch(branchId: string | null): void {
    this.props.branchId = branchId;
    this.touch();
  }

  grantPermission(key: string): void {
    this.props.permissionRevokes = this.props.permissionRevokes.filter((k) => k !== key);
    if (!this.props.permissionGrants.includes(key)) this.props.permissionGrants.push(key);
    this.touch();
  }

  revokePermission(key: string): void {
    this.props.permissionGrants = this.props.permissionGrants.filter((k) => k !== key);
    if (!this.props.permissionRevokes.includes(key)) this.props.permissionRevokes.push(key);
    this.touch();
  }

  // بيستبدل كل الاستثناءات دفعة واحدة (نفس PATCH /api/users/:id { permissions } في الريبو القديم -
  // الأدمن بيبعت "الصلاحيات الفعلية المطلوبة" ككل، مش grant/revoke منفصلين)
  replacePermissionOverrides(desiredKeys: string[], roleDefaults: Set<string>): void {
    this.props.permissionGrants = desiredKeys.filter((k) => !roleDefaults.has(k));
    this.props.permissionRevokes = [...roleDefaults].filter((k) => !desiredKeys.includes(k));
    this.touch();
  }

  // بيحط الاستثناءات كما هي (مش بيحسب فرق مقابل صلاحيات الدور زي replacePermissionOverrides) -
  // مخصصة لحالة الاستيراد من الريبو القديم (NEO-5) اللي بيجيب grants/revokes جاهزين محسوبين بالفعل
  setPermissionOverrides(grants: string[], revokes: string[]): void {
    this.props.permissionGrants = [...grants];
    this.props.permissionRevokes = [...revokes];
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
  get role(): Role { return this.props.role; }
  get branchId(): string | null { return this.props.branchId; }
  get permissionGrants(): readonly string[] { return this.props.permissionGrants; }
  get permissionRevokes(): readonly string[] { return this.props.permissionRevokes; }
  get pinHash(): string | null { return this.props.pinHash; }
  get isActive(): boolean { return this.props.isActive; }
  get legacyUserId(): number | null { return this.props.legacyUserId; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }
}
