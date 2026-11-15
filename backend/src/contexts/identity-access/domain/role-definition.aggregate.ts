import { randomBytes } from "node:crypto";
import { FullAccessRoleLockedError, RoleLabelRequiredError, RolesManageIsFullAccessOnlyError } from "./errors";
import { PERMISSION } from "./permission";
import type { Role, RoleScope } from "./role";

export interface RoleDefinitionProps {
  label: string;
  scope: RoleScope;
  fullAccess: boolean;
  sortOrder: number;
  permissions: string[];
}

export class RoleDefinition {
  private constructor(
    public readonly key: Role,
    private props: RoleDefinitionProps
  ) {}

  static register(input: { label: string; scope: RoleScope; permissions: readonly string[]; sortOrder: number }): RoleDefinition {
    const role = new RoleDefinition(`role_${randomBytes(4).toString("hex")}`, {
      label: RoleDefinition.cleanLabel(input.label),
      scope: input.scope,
      fullAccess: false,
      sortOrder: input.sortOrder,
      permissions: [],
    });
    role.replacePermissions(input.permissions);
    return role;
  }

  static reconstitute(key: Role, props: RoleDefinitionProps): RoleDefinition {
    return new RoleDefinition(key, props);
  }

  rename(label: string): void {
    this.props.label = RoleDefinition.cleanLabel(label);
  }

  changeScope(scope: RoleScope): void {
    if (this.props.fullAccess) throw new FullAccessRoleLockedError();
    this.props.scope = scope;
  }

  replacePermissions(keys: readonly string[]): void {
    if (this.props.fullAccess) throw new FullAccessRoleLockedError();
    if (keys.includes(PERMISSION.IDENTITY_ROLES_MANAGE)) throw new RolesManageIsFullAccessOnlyError();
    this.props.permissions = [...new Set(keys)];
  }

  assertDeletable(): void {
    if (this.props.fullAccess) throw new FullAccessRoleLockedError();
  }

  private static cleanLabel(label: string): string {
    const cleaned = label.trim();
    if (!cleaned) throw new RoleLabelRequiredError();
    return cleaned;
  }

  get label(): string { return this.props.label; }
  get scope(): RoleScope { return this.props.scope; }
  get fullAccess(): boolean { return this.props.fullAccess; }
  get sortOrder(): number { return this.props.sortOrder; }
  get permissions(): readonly string[] { return this.props.permissions; }
}
