import { PERMISSION, type Permission } from "./shared/auth/permissions";
import { can } from "./shared/auth/roles";
import type { NavItem } from "./shared/ui/AppShell";
import {
  BoxIcon,
  BookIcon,
  BuildingIcon,
  CardIcon,
  CartIcon,
  ChatBubbleIcon,
  ChartIcon,
  ClipboardIcon,
  CoinsIcon,
  FactoryIcon,
  FireIcon,
  GearIcon,
  HomeIcon,
  IdCardIcon,
  ListSearchIcon,
  LockIcon,
  PrinterIcon,
  ReceiptIcon,
  ShieldUserIcon,
  TruckIcon,
  UserCircleIcon,
  UserGroupIcon,
  UsersIcon,
  VaultIcon,
} from "./shared/ui/icons";

export type NavEntry = Omit<NavItem, "to">;

export interface StaffRoute {
  path: string;
  perm: readonly Permission[] | null;
  nav: NavEntry;
}

const P = PERMISSION;

export const STAFF_ROUTES = [
  { path: "/", perm: null, nav: { label: "الرئيسية", icon: HomeIcon, end: true } },
  { path: "/me", perm: [P.HR_SELF_VIEW, P.HR_SELF_LEAVE_MANAGE], nav: { label: "بياناتي", icon: UserCircleIcon } },
  { path: "/orders", perm: [P.ORDERS_VIEW, P.ORDERS_CREATE], nav: { label: "الطلبات (POS)", icon: CartIcon } },
  { path: "/kds", perm: [P.KITCHEN_VIEW], nav: { label: "شاشة المطبخ", icon: FireIcon } },
  {
    path: "/crm",
    perm: [P.CRM_FOLLOWUPS_VIEW, P.CRM_COMPLAINTS_VIEW],
    nav: { label: "متابعة العملاء والشكاوى", icon: UsersIcon },
  },
  { path: "/customers", perm: [P.CUSTOMERS_VIEW], nav: { label: "العملاء", icon: UserGroupIcon } },
  { path: "/whatsapp", perm: [P.WHATSAPP_VIEW], nav: { label: "بوابة واتساب", icon: ChatBubbleIcon } },
  { path: "/branches", perm: [P.BRANCHES_VIEW, P.BRANCHES_MANAGE], nav: { label: "الفروع", icon: BuildingIcon } },
  {
    path: "/inventory",
    perm: [P.INVENTORY_ITEMS_VIEW, P.INVENTORY_ITEMS_MANAGE],
    nav: { label: "المخزون", icon: BoxIcon },
  },
  {
    path: "/catalog",
    perm: [P.CATALOG_ITEMS_VIEW, P.CATALOG_ITEMS_MANAGE],
    nav: { label: "قائمة الطعام", icon: BookIcon },
  },
  {
    path: "/production",
    perm: [P.PRODUCTION_VIEW, P.CATALOG_RECIPES_MANAGE],
    nav: { label: "التصنيع والتعبئة", icon: FactoryIcon },
  },
  {
    path: "/procurement",
    perm: [
      P.PROCUREMENT_GOODS_RECEIPTS_VIEW,
      P.PROCUREMENT_GOODS_RECEIPTS_MANAGE,
      P.PROCUREMENT_PURCHASE_ORDERS_VIEW,
      P.PROCUREMENT_PURCHASE_ORDERS_MANAGE,
      P.PURCHASING_VIEW,
    ],
    nav: { label: "المشتريات والموردين", icon: ClipboardIcon },
  },
  {
    path: "/delivery",
    perm: [
      P.DELIVERY_ASSIGNMENTS_VIEW,
      P.DELIVERY_ASSIGNMENTS_MANAGE,
      P.DELIVERY_SETTLEMENTS_VIEW,
      P.DELIVERY_SETTLEMENTS_CREATE,
      P.DELIVERY_SETTLEMENTS_REVIEW,
      P.DELIVERY_SHIFTS_MANAGE,
    ],
    nav: { label: "التوصيل والسائقين", icon: TruckIcon },
  },
  {
    path: "/branch-day",
    perm: [P.BRANCH_DAY_VIEW, P.BRANCH_DAY_CLOSE],
    nav: { label: "قفل يوم الفرع", icon: LockIcon },
  },
  {
    path: "/accounting",
    perm: [P.ACCOUNTING_VIEW, P.ACCOUNTING_MANAGE],
    nav: { label: "المحاسبة", icon: CoinsIcon },
  },
  {
    path: "/expenses",
    perm: [P.EXPENSES_VIEW, P.EXPENSES_CREATE_OWN_DAILY],
    nav: { label: "المصروفات", icon: ReceiptIcon },
  },
  {
    path: "/purchases",
    perm: [P.PURCHASES_VIEW, P.PURCHASES_VIEW_OWN_DAILY],
    nav: { label: "المشتريات النقدية", icon: CartIcon },
  },
  {
    path: "/talabat",
    perm: [P.TALABAT_VIEW, P.TALABAT_MAPPING_MANAGE, P.TALABAT_RECONCILIATION],
    nav: { label: "تكامل Talabat", icon: TruckIcon },
  },
  {
    path: "/financial-reports",
    perm: [P.ACCOUNTING_VIEW, P.ACCOUNTING_MANAGE, P.REPORTS_VIEW, P.REPORTS_BRANCH_HEALTH],
    nav: { label: "التقارير المحاسبية", icon: ChartIcon },
  },
  {
    path: "/operational-reports",
    perm: [P.REPORTS_VIEW, P.REPORTS_BRANCH_HEALTH, P.PURCHASING_VIEW],
    nav: { label: "تقارير المبيعات والتشغيل", icon: ListSearchIcon },
  },
  {
    path: "/treasuries",
    perm: [P.TREASURIES_VIEW, P.BANKS_VIEW],
    nav: { label: "الخزائن والبنوك", icon: VaultIcon },
  },
  {
    path: "/payment-control",
    perm: [P.PAYMENT_CONTROL_VIEW],
    nav: { label: "التحكم في المدفوعات والمطابقة", icon: CardIcon },
  },
  {
    path: "/hr-payroll",
    perm: [
      P.HR_EMPLOYEES_VIEW,
      P.HR_EMPLOYEES_MANAGE,
      P.HR_PAYROLL_VIEW,
      P.HR_PAYROLL_MANAGE,
      P.HR_LEAVE_REVIEW,
      P.HR_PAYROLL_ADJUSTMENTS_MANAGE,
    ],
    nav: { label: "الموارد البشرية والرواتب", icon: IdCardIcon },
  },
  {
    path: "/printing",
    perm: [
      P.PRINTERS_VIEW,
      P.PRINTERS_MANAGE,
      P.PRINT_ROUTING_VIEW,
      P.PRINT_ROUTING_MANAGE,
      P.PRINT_JOBS_VIEW,
      P.PRINT_JOBS_MANAGE_QUEUE,
    ],
    nav: { label: "الطباعة", icon: PrinterIcon },
  },
  {
    path: "/users",
    perm: [P.IDENTITY_USERS_VIEW, P.IDENTITY_USERS_MANAGE],
    nav: { label: "المستخدمين", icon: ShieldUserIcon },
  },
  { path: "/roles", perm: [P.IDENTITY_ROLES_MANAGE], nav: { label: "الأدوار والصلاحيات", icon: LockIcon } },
  { path: "/audit-log", perm: [P.AUDIT_VIEW], nav: { label: "سجل التدقيق", icon: ListSearchIcon } },
  { path: "/loyalty", perm: [P.LOYALTY_VIEW, P.LOYALTY_MANAGE], nav: { label: "نقاط الولاء", icon: CoinsIcon } },
  {
    path: "/pos-settings",
    perm: [P.POS_SETTINGS_VIEW, P.POS_SETTINGS_MANAGE],
    nav: { label: "إعدادات النظام", icon: GearIcon },
  },
] as const satisfies readonly StaffRoute[];

export type StaffPath = (typeof STAFF_ROUTES)[number]["path"];

export function canOpenRoute(user: { permissions: readonly Permission[] } | null | undefined, route: Pick<StaffRoute, "perm">): boolean {
  return route.perm === null ? !!user : can(user, ...route.perm);
}

export function navItemsFor(user: { permissions: readonly Permission[] } | null | undefined): NavItem[] {
  return STAFF_ROUTES.filter((r) => canOpenRoute(user, r)).map((r) => ({ to: r.path, ...r.nav }));
}

export function canOpenPath(user: { permissions: readonly Permission[] } | null | undefined, path: string): boolean {
  const route = STAFF_ROUTES.find((r) => r.path === path.split(/[?#]/)[0]);
  return route ? canOpenRoute(user, route) : true;
}
