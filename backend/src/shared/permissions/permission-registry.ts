import { Injectable } from "@nestjs/common";

export interface PermissionDefinition {
  key: string;
  label: string;
}

export interface PermissionGroup {
  group: string;
  groupLabel: string;
  permissions: PermissionDefinition[];
}

// المصدر الوحيد للصلاحيات في النظام - بس بخلاف الريبو القديم (middleware/permissions.js فيه كتالوج
// واحد ثابت بيعرف صلاحيات كل الأنظمة سوا)، هنا كل context بيسجّل صلاحياته هو بس وقت الإقلاع
// (registerGroup + setRoleDefaults في الـmodule بتاعه) - Identity & Access (اللي فيه الـregistry ده)
// مش محتاج يعرف حاجة عن صلاحيات CRM أو المخزون مسبقًا. ده بيحل مشكلة حقيقية في الريبو القديم: كتالوج
// الصلاحيات كان لازم يتحدّث في ملف واحد مركزي كل ما أي context يضيف صلاحية جديدة.
@Injectable()
export class PermissionRegistry {
  private readonly groups = new Map<string, PermissionGroup>();
  private readonly roleDefaults = new Map<string, Set<string>>();
  private readonly allKeys = new Set<string>();

  registerGroup(group: PermissionGroup): void {
    if (this.groups.has(group.group)) {
      throw new Error(`مجموعة الصلاحيات "${group.group}" مسجّلة قبل كده`);
    }
    this.groups.set(group.group, group);
    for (const p of group.permissions) this.allKeys.add(p.key);
  }

  setRoleDefaults(role: string, keys: string[]): void {
    const existing = this.roleDefaults.get(role) || new Set<string>();
    for (const key of keys) existing.add(key);
    this.roleDefaults.set(role, existing);
  }

  isKnownPermission(key: string): boolean {
    return this.allKeys.has(key);
  }

  getRoleDefaults(role: string): Set<string> {
    return this.roleDefaults.get(role) || new Set<string>();
  }

  getCatalog(): PermissionGroup[] {
    return [...this.groups.values()];
  }

  getAllKeys(): string[] {
    return [...this.allKeys];
  }

  // admin دايمًا كل الصلاحيات المسجّلة كلها - نفس فلسفة ROLE_PERMISSIONS.admin = ["*"] في الريبو
  // القديم، بس هنا بيتحسب ديناميكيًا من كل الصلاحيات المسجّلة بدل ما يبقى رمز "*" خاص لازم كل حتة
  // في الكود تتعامل معاه بشكل مختلف
  hasPermission(
    role: string,
    permission: string,
    overrides?: { grants?: string[]; revokes?: string[] }
  ): boolean {
    if (overrides?.revokes?.includes(permission)) return false;
    if (overrides?.grants?.includes(permission)) return true;
    if (role === "admin") return this.allKeys.has(permission);
    return this.getRoleDefaults(role).has(permission);
  }
}
