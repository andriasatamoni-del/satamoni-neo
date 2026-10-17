import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { can, isCompanyWide, type Role } from "../auth/roles";
import type { Permission } from "../auth/permissions";

export interface TabItem {
  key: string;
  label: string;
  // أي صلاحية واحدة كفاية عشان التاب يظهر. من غيرها التاب ظاهر لأي حد يقدر يفتح الصفحة.
  perm?: Permission | readonly Permission[];
  // الـendpoint عليه @CompanyWideOnly(): اليوزر المربوط بفرع بياخد 403 حتى لو معاه الصلاحية
  companyWideOnly?: boolean;
}

type TabUser = { permissions: readonly Permission[]; roles: readonly Role[]; branchId?: string | null };

export function isTabAllowed(user: TabUser | null | undefined, tab: TabItem): boolean {
  if (tab.companyWideOnly && !isCompanyWide(user)) return false;
  if (!tab.perm) return true;
  return can(user, ...(typeof tab.perm === "string" ? [tab.perm] : tab.perm));
}

// التابات المسموحة بس + التاب النشط. لو التاب المختار مش مسموح (أو اتشال من الدور) بنرجع لأول تاب مسموح
// في نفس الريندر - عشان محتوى التاب الممنوع وكويريز بتاعته ما يتعرضوش ولا لحظة.
// selected = null يعني المستخدم لسه ما اختارش، فالتاب الافتراضي بيتحسب كل ريندر (مش بيتثبّت على أول
// ريندر قبل ما الصلاحيات توصل).
export function usePermittedTabs<T extends TabItem>(allTabs: readonly T[], initial?: string) {
  const { user } = useAuth();
  const tabs = allTabs.filter((t) => isTabAllowed(user, t));
  const [selected, setSelected] = useState<string | null>(initial ?? null);
  const active = selected !== null && tabs.some((t) => t.key === selected) ? selected : (tabs[0]?.key ?? "");
  return { tabs, active, setActive: setSelected };
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: readonly TabItem[];
  active: string;
  onChange: (key: string) => void;
}) {
  const { user } = useAuth();
  const visible = tabs.filter((t) => isTabAllowed(user, t));
  return (
    <div className="mb-5 flex flex-wrap gap-1 border-b border-slate-200">
      {visible.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={`-mb-px rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
            active === tab.key
              ? "border-brand-600 text-brand-700"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
