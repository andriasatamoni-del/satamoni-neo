import type { PermissionGroup } from "./permissionsCatalog";

const LOCKED_PERMISSIONS = new Set(["identity.roles.manage"]);

export function PermissionChecklist({
  groups,
  selected,
  onChange,
}: {
  groups: PermissionGroup[];
  selected: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
}) {
  function toggle(key: string) {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(next);
  }

  function toggleGroup(group: PermissionGroup, select: boolean) {
    const next = new Set(selected);
    for (const p of group.permissions) {
      if (LOCKED_PERMISSIONS.has(p.key)) continue;
      if (select) next.add(p.key);
      else next.delete(p.key);
    }
    onChange(next);
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">{selected.size} صلاحية متحددة</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((group) => {
          const selectable = group.permissions.filter((p) => !LOCKED_PERMISSIONS.has(p.key));
          const allSelected = selectable.length > 0 && selectable.every((p) => selected.has(p.key));
          return (
            <div key={group.group} className="rounded-lg border border-slate-200 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-bold text-slate-500">{group.groupLabel}</p>
                {selectable.length > 0 && (
                  <button type="button" onClick={() => toggleGroup(group, !allSelected)} className="text-xs font-medium text-brand-600 hover:underline">
                    {allSelected ? "شيل الكل" : "اختار الكل"}
                  </button>
                )}
              </div>
              <div className="space-y-1.5">
                {group.permissions.map((perm) => {
                  const locked = LOCKED_PERMISSIONS.has(perm.key);
                  return (
                    <label key={perm.key} className={`flex items-center gap-2 text-sm ${locked ? "text-slate-400" : "text-slate-700"}`}>
                      <input
                        type="checkbox"
                        checked={!locked && selected.has(perm.key)}
                        disabled={locked}
                        onChange={() => toggle(perm.key)}
                        className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                      />
                      {perm.label}
                      {locked && <span className="text-xs">(لدور كامل الصلاحيات بس)</span>}
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
