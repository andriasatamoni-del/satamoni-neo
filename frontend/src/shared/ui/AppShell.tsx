import { useState, type ComponentType, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { roleLabels } from "../auth/roles";
import { CloseIcon, LogoutIcon, MenuIcon } from "./icons";

export interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  end?: boolean;
}

function NavContent({ items, onNavigate }: { items: readonly NavItem[]; onNavigate?: () => void }) {
  return (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
      {items.map(({ to, label, icon: ItemIcon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive ? "bg-brand-600 text-white shadow-sm" : "text-slate-300 hover:bg-slate-800 hover:text-white"
            }`
          }
        >
          <ItemIcon className="h-5 w-5 shrink-0" />
          <span className="truncate">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

// navItems: الروابط اللي المستخدم يقدر يفتحها بس (App.tsx بيفلترها من STAFF_ROUTES بنفس صلاحيات الراوت).
export function AppShell({ navItems, children }: { navItems: readonly NavItem[]; children: ReactNode }) {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Sidebar - desktop */}
      <aside className="fixed inset-y-0 right-0 hidden w-64 flex-col bg-slate-900 lg:flex">
        <div className="flex items-center gap-2 border-b border-slate-800 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-lg font-black text-white">
            س
          </div>
          <span className="text-lg font-extrabold text-white">ستاموني</span>
        </div>
        <NavContent items={navItems} />
      </aside>

      {/* Sidebar - mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 right-0 flex w-72 flex-col bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-5">
              <span className="text-lg font-extrabold text-white">ستاموني</span>
              <button onClick={() => setMobileOpen(false)} className="text-slate-300">
                <CloseIcon className="h-6 w-6" />
              </button>
            </div>
            <NavContent items={navItems} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="lg:mr-64">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 shadow-sm lg:px-8">
          <button onClick={() => setMobileOpen(true)} className="text-slate-600 lg:hidden">
            <MenuIcon className="h-6 w-6" />
          </button>
          <span className="hidden text-sm font-medium text-slate-400 lg:block">
            نظام إدارة المطعم - ستاموني
          </span>
          <div className="flex items-center gap-3">
            <div className="text-end leading-tight">
              <p className="text-sm font-semibold text-slate-800">{user?.name}</p>
              <p className="text-xs text-slate-400">{user ? roleLabels(user.roles) : ""}</p>
            </div>
            <button
              onClick={logout}
              title="تسجيل خروج"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-red-600"
            >
              <LogoutIcon className="h-5 w-5" />
            </button>
          </div>
        </header>
        <main className="px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
