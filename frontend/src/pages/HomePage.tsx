import { Link } from "react-router-dom";
import { useAuth } from "../shared/auth/AuthContext";
import { PageHeader } from "../shared/ui/PageHeader";
import { DashboardSummary } from "./home/DashboardSummary";
import {
  BoxIcon,
  BookIcon,
  BuildingIcon,
  CardIcon,
  CartIcon,
  ClipboardIcon,
  CoinsIcon,
  IdCardIcon,
  TruckIcon,
  UsersIcon,
} from "../shared/ui/icons";

const TILES = [
  { to: "/orders", label: "الطلبات (POS)", desc: "تسجيل وتتبّع طلبات البيع", icon: CartIcon },
  { to: "/crm", label: "متابعة العملاء والشكاوى", desc: "المتابعات والشكاوى", icon: UsersIcon },
  { to: "/branches", label: "الفروع", desc: "إدارة فروع المطعم", icon: BuildingIcon },
  { to: "/inventory", label: "المخزون", desc: "الأصناف والأرصدة", icon: BoxIcon },
  { to: "/catalog", label: "قائمة الطعام", desc: "الأقسام والأصناف", icon: BookIcon },
  { to: "/procurement", label: "المشتريات والموردين", desc: "أوامر الشراء والاستلام", icon: ClipboardIcon },
  { to: "/delivery", label: "التوصيل والسائقين", desc: "تعيينات التوصيل", icon: TruckIcon },
  { to: "/accounting", label: "المحاسبة", desc: "الحسابات والقيود", icon: CoinsIcon },
  { to: "/payment-control", label: "التحكم في المدفوعات والمطابقة", desc: "الدفعات والمطابقة", icon: CardIcon },
  { to: "/hr-payroll", label: "الموارد البشرية والرواتب", desc: "الموظفين وقوائم الرواتب", icon: IdCardIcon },
];

export function HomePage() {
  const { user } = useAuth();

  return (
    <div>
      <PageHeader
        title={`أهلاً ${user?.name ?? ""} 👋`}
        description="اختار من الأقسام تحت عشان تبدأ"
      />
      <DashboardSummary />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {TILES.map(({ to, label, desc, icon: TileIcon }) => (
          <Link
            key={to}
            to={to}
            className="group flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 group-hover:bg-brand-600 group-hover:text-white transition-colors">
              <TileIcon className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">{label}</h3>
              <p className="mt-0.5 text-xs text-slate-500">{desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
