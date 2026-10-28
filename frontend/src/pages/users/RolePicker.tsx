import { ROLES, ROLE_LABELS, type Role } from "../../shared/auth/roles";
import { effectivePermissionCount, rolePermissionCountLabel, type PermissionsCatalog } from "./permissionsCatalog";

function toggled<T>(list: readonly T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export function RolePicker({
  value,
  onChange,
  catalog,
  lockedRoles = [],
}: {
  value: Role[];
  onChange: (roles: Role[]) => void;
  catalog: PermissionsCatalog | undefined;
  lockedRoles?: readonly Role[];
}) {
  return (
    <div className="space-y-2">
      {ROLES.map((r) => (
        <label key={r} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
          <span className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={value.includes(r)}
              disabled={lockedRoles.includes(r)}
              onChange={() => onChange(toggled(value, r))}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            {ROLE_LABELS[r]}
          </span>
          {catalog && <span className="text-xs text-slate-500">{rolePermissionCountLabel(r, catalog)}</span>}
        </label>
      ))}
      {catalog && (
        <p className="text-xs text-slate-500">
          صلاحيات المستخدم هي مجموع صلاحيات أدواره: {effectivePermissionCount(value, catalog)} صلاحية.
        </p>
      )}
    </div>
  );
}
