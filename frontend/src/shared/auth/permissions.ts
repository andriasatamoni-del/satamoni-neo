// مفاتيح الصلاحيات - نسخة مطابقة لـbackend/src/contexts/identity-access/domain/permission.ts (المصدر الأساسي).
// لو ضفت أو شيلت صلاحية هناك لازم تعدّلها هنا كمان: backend/test/unit/identity-access/permissions-sync.spec.ts بيفشل لو اختلفوا.
// الباك هو اللي بيفرض الصلاحيات - هنا بس عشان نخفي/نظهر الأزرار بمفاتيح متشيّكة وقت الكومبايل.
export const PERMISSION = {
  // identity - الهوية والوصول
  IDENTITY_USERS_VIEW: "identity.users.view",
  IDENTITY_USERS_MANAGE: "identity.users.manage",
  IDENTITY_ROLES_MANAGE: "identity.roles.manage",
  // pos_settings - إعدادات النظام
  POS_SETTINGS_VIEW: "pos_settings.view",
  POS_SETTINGS_MANAGE: "pos_settings.manage",
  // accounting - الحسابات
  ACCOUNTING_VIEW: "accounting.view",
  ACCOUNTING_MANAGE: "accounting.manage",
  ACCOUNTING_CREATE: "accounting.create",
  ACCOUNTING_POST: "accounting.post",
  ACCOUNTING_CLOSE_PERIOD: "accounting.close_period",
  ACCOUNTING_CLOSE_YEAR: "accounting.close_year",
  ACCOUNTING_REPAIR: "accounting.repair",
  // branches - الفروع
  BRANCHES_VIEW: "branches.view",
  BRANCHES_MANAGE: "branches.manage",
  // crm - متابعة العملاء والشكاوى
  CRM_FOLLOWUPS_VIEW: "crm.followups.view",
  CRM_FOLLOWUPS_RECORD: "crm.followups.record",
  CRM_COMPLAINTS_VIEW: "crm.complaints.view",
  CRM_COMPLAINTS_MANAGE: "crm.complaints.manage",
  // inventory - المخزون
  INVENTORY_ITEMS_VIEW: "inventory.items.view",
  INVENTORY_ITEMS_MANAGE: "inventory.items.manage",
  INVENTORY_MOVEMENTS_RECORD: "inventory.movements.record",
  INVENTORY_BATCHES_MANAGE: "inventory.batches.manage",
  // catalog - قائمة الطعام والوصفات
  CATALOG_ITEMS_VIEW: "catalog.items.view",
  CATALOG_ITEMS_MANAGE: "catalog.items.manage",
  CATALOG_RECIPES_MANAGE: "catalog.recipes.manage",
  // procurement - المشتريات والموردين
  PROCUREMENT_SUPPLIERS_VIEW: "procurement.suppliers.view",
  PROCUREMENT_SUPPLIERS_MANAGE: "procurement.suppliers.manage",
  PROCUREMENT_PURCHASE_ORDERS_VIEW: "procurement.purchase_orders.view",
  PROCUREMENT_PURCHASE_ORDERS_MANAGE: "procurement.purchase_orders.manage",
  PROCUREMENT_GOODS_RECEIPTS_VIEW: "procurement.goods_receipts.view",
  PROCUREMENT_GOODS_RECEIPTS_MANAGE: "procurement.goods_receipts.manage",
  // purchasing - فواتير وسدادات وطلبات ومرتجعات الموردين
  PURCHASING_VIEW: "purchasing.view",
  PURCHASING_CREATE: "purchasing.create",
  PURCHASING_SUBMIT: "purchasing.submit",
  PURCHASING_APPROVE: "purchasing.approve",
  PURCHASING_CANCEL: "purchasing.cancel",
  // treasuries - الخزائن والبنوك
  TREASURIES_VIEW: "treasuries.view",
  TREASURIES_TRANSFER: "treasuries.transfer",
  TREASURIES_MANAGE: "treasuries.manage",
  BANKS_VIEW: "banks.view",
  BANKS_MANAGE: "banks.manage",
  // orders - الطلبات والبيع
  ORDERS_VIEW: "orders.view",
  ORDERS_CREATE: "orders.create",
  ORDERS_MANAGE: "orders.manage",
  // kitchen - شاشة المطبخ
  KITCHEN_VIEW: "kitchen.view",
  KITCHEN_ADVANCE: "kitchen.advance",
  // delivery - التوصيل والسائقين
  DELIVERY_DRIVERS_VIEW: "delivery.drivers.view",
  DELIVERY_DRIVERS_MANAGE: "delivery.drivers.manage",
  DELIVERY_ASSIGNMENTS_VIEW: "delivery.assignments.view",
  DELIVERY_ASSIGNMENTS_MANAGE: "delivery.assignments.manage",
  DELIVERY_SETTLEMENTS_VIEW: "delivery.settlements.view",
  DELIVERY_SETTLEMENTS_CREATE: "delivery.settlements.create",
  DELIVERY_SETTLEMENTS_REVIEW: "delivery.settlements.review",
  DELIVERY_SHIFTS_MANAGE: "delivery.shifts.manage",
  // payment_control - التحكم في المدفوعات والمطابقة
  PAYMENT_CONTROL_VIEW: "payment_control.view",
  PAYMENT_CONTROL_METHODS_MANAGE: "payment_control.methods.manage",
  PAYMENT_CONTROL_ADJUSTMENT_REQUEST: "payment_control.adjustment.request",
  PAYMENT_CONTROL_ADJUSTMENT_APPROVE: "payment_control.adjustment.approve",
  PAYMENT_CONTROL_ADJUSTMENT_APPROVE_HIGH: "payment_control.adjustment.approve_high",
  PAYMENT_CONTROL_RECONCILIATION_ENTER: "payment_control.reconciliation.enter",
  PAYMENT_CONTROL_EXCEPTIONS_RESOLVE: "payment_control.exceptions.resolve",
  // loyalty - نقاط الولاء
  LOYALTY_VIEW: "loyalty.view",
  LOYALTY_MANAGE: "loyalty.manage",
  // audit - سجل التدقيق
  AUDIT_VIEW: "audit.view",
  // production - التصنيع والتعبئة
  PRODUCTION_VIEW: "production.view",
  PRODUCTION_CREATE: "production.create",
  PRODUCTION_APPROVE: "production.approve",
  PRODUCTION_COMPLETE: "production.complete",
  PRODUCTION_CANCEL: "production.cancel",
  // whatsapp - بوابة استقبال واتساب
  WHATSAPP_VIEW: "whatsapp.view",
  WHATSAPP_REPLY: "whatsapp.reply",
  WHATSAPP_ORDERS_MANAGE: "whatsapp.orders.manage",
  WHATSAPP_COMPLAINTS_CREATE: "whatsapp.complaints.create",
  // hr - الموارد البشرية والرواتب
  HR_EMPLOYEES_VIEW: "hr.employees.view",
  HR_EMPLOYEES_MANAGE: "hr.employees.manage",
  HR_PAYROLL_VIEW: "hr.payroll.view",
  HR_PAYROLL_MANAGE: "hr.payroll.manage",
  HR_PAYROLL_APPROVE: "hr.payroll.approve",
  HR_SELF_VIEW: "hr.self.view",
  HR_SELF_LEAVE_MANAGE: "hr.self.leave.manage",
  HR_LEAVE_REVIEW: "hr.leave.review",
  HR_PAYROLL_ADJUSTMENTS_MANAGE: "hr.payroll.adjustments.manage",
  HR_ORGANIZATION_MANAGE: "hr.organization.manage",
  // shifts - شيفتات الكاشير
  SHIFTS_OPEN_OWN: "shifts.open_own",
  SHIFTS_CLOSE_OWN: "shifts.close_own",
  SHIFTS_VIEW_OWN: "shifts.view_own",
  SHIFTS_VIEW_BRANCH: "shifts.view_branch",
  SHIFTS_REVIEW: "shifts.review",
  SHIFTS_RECORD_CASH_ENTRY: "shifts.record_cash_entry",
  // reports - التقارير ولوحة التحكم
  REPORTS_VIEW: "reports.view",
  REPORTS_BRANCH_HEALTH: "reports.branch_health",
  // printers - الطابعات
  PRINTERS_VIEW: "printers.view",
  PRINTERS_MANAGE: "printers.manage",
  // print_routing - محطات التحضير والتوجيه
  PRINT_ROUTING_VIEW: "print_routing.view",
  PRINT_ROUTING_MANAGE: "print_routing.manage",
  // print_jobs - طابور الطباعة
  PRINT_JOBS_VIEW: "print_jobs.view",
  PRINT_JOBS_MANAGE_QUEUE: "print_jobs.manage_queue",
  // branch_day - قفل يوم الفرع
  BRANCH_DAY_VIEW: "branch_day.view",
  BRANCH_DAY_CLOSE: "branch_day.close",
  // expenses - المصروفات
  EXPENSES_VIEW: "expenses.view",
  EXPENSES_CREATE: "expenses.create",
  EXPENSES_CREATE_OWN_DAILY: "expenses.create_own_daily",
  EXPENSES_REVIEW: "expenses.review",
  EXPENSES_MANAGE: "expenses.manage",
  // purchases - المشتريات النقدية
  PURCHASES_VIEW: "purchases.view",
  PURCHASES_VIEW_OWN_DAILY: "purchases.view_own_daily",
  PURCHASES_CREATE: "purchases.create",
  PURCHASES_CREATE_OWN_DAILY: "purchases.create_own_daily",
  PURCHASES_EDIT_OWN_DAILY: "purchases.edit_own_daily",
  PURCHASES_REVIEW: "purchases.review",
  // talabat - تكامل Talabat
  TALABAT_VIEW: "talabat.view",
  TALABAT_RETRY: "talabat.retry",
  TALABAT_PAYMENT_OVERRIDE: "talabat.payment_override",
  TALABAT_RECONCILIATION: "talabat.reconciliation",
  TALABAT_MAPPING_MANAGE: "talabat.mapping_manage",
  // home_tiles - بطاقات الصفحة الرئيسية
  HOME_TILES_MANAGE: "home_tiles.manage",
} as const;

export type Permission = (typeof PERMISSION)[keyof typeof PERMISSION];
