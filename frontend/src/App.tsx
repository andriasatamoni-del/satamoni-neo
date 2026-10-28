import type { ComponentType } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./shared/auth/AuthContext";
import { RequirePermission } from "./shared/auth/RequirePermission";
import { AppShell } from "./shared/ui/AppShell";
import { NotFound } from "./shared/ui/NoAccess";
import { STAFF_ROUTES, navItemsFor, type StaffPath } from "./routes";
import { LoginPage } from "./pages/LoginPage";
import { HomePage } from "./pages/HomePage";
import { CrmPage } from "./pages/CrmPage";
import { CustomersPage } from "./pages/CustomersPage";
import { BranchesPage } from "./pages/BranchesPage";
import { InventoryPage } from "./pages/InventoryPage";
import { CatalogPage } from "./pages/CatalogPage";
import { ProductionPage } from "./pages/ProductionPage";
import { WhatsappPage } from "./pages/WhatsappPage";
import { ProcurementPage } from "./pages/ProcurementPage";
import { OrdersPage } from "./pages/OrdersPage";
import { KdsPage } from "./pages/KdsPage";
import { DeliveryPage } from "./pages/DeliveryPage";
import { AccountingPage } from "./pages/AccountingPage";
import { PaymentControlPage } from "./pages/PaymentControlPage";
import { HrPayrollPage } from "./pages/HrPayrollPage";
import { UsersPage } from "./pages/UsersPage";
import { RolesPage } from "./pages/RolesPage";
import { TreasuriesPage } from "./pages/TreasuriesPage";
import { MyProfilePage } from "./pages/MyProfilePage";
import { AuditLogPage } from "./pages/AuditLogPage";
import { PrintingPage } from "./pages/PrintingPage";
import { PosSettingsPage } from "./pages/PosSettingsPage";
import { BranchDayPage } from "./pages/BranchDayPage";
import { FinancialReportsPage } from "./pages/FinancialReportsPage";
import { OperationalReportsPage } from "./pages/OperationalReportsPage";
import { ExpensesPage } from "./pages/ExpensesPage";
import { PurchasesPage } from "./pages/PurchasesPage";
import { TalabatPage } from "./pages/TalabatPage";
import { LoyaltyPage } from "./pages/LoyaltyPage";
import { RateOrderPage } from "./pages/RateOrderPage";
import { CustomerPortalLoginPage } from "./pages/portal/CustomerPortalLoginPage";
import { CustomerPortalRegisterPage } from "./pages/portal/CustomerPortalRegisterPage";
import { CustomerPortalProfilePage } from "./pages/portal/CustomerPortalProfilePage";
import { StorefrontPage } from "./pages/storefront/StorefrontPage";
import { TrackOrderPage } from "./pages/storefront/TrackOrderPage";
import { MyOrdersPage } from "./pages/storefront/MyOrdersPage";

const STAFF_PAGES: Record<StaffPath, ComponentType> = {
  "/": HomePage,
  "/me": MyProfilePage,
  "/orders": OrdersPage,
  "/kds": KdsPage,
  "/crm": CrmPage,
  "/customers": CustomersPage,
  "/whatsapp": WhatsappPage,
  "/branches": BranchesPage,
  "/inventory": InventoryPage,
  "/catalog": CatalogPage,
  "/production": ProductionPage,
  "/procurement": ProcurementPage,
  "/delivery": DeliveryPage,
  "/branch-day": BranchDayPage,
  "/accounting": AccountingPage,
  "/expenses": ExpensesPage,
  "/purchases": PurchasesPage,
  "/talabat": TalabatPage,
  "/financial-reports": FinancialReportsPage,
  "/operational-reports": OperationalReportsPage,
  "/treasuries": TreasuriesPage,
  "/payment-control": PaymentControlPage,
  "/hr-payroll": HrPayrollPage,
  "/printing": PrintingPage,
  "/users": UsersPage,
  "/roles": RolesPage,
  "/audit-log": AuditLogPage,
  "/loyalty": LoyaltyPage,
  "/pos-settings": PosSettingsPage,
};

function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm font-medium text-slate-400">بيتم التحميل...</p>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <AppShell navItems={navItemsFor(user)}>{children}</AppShell>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/rate/:orderId" element={<RateOrderPage />} />
      <Route path="/portal/login" element={<CustomerPortalLoginPage />} />
      <Route path="/portal/register" element={<CustomerPortalRegisterPage />} />
      <Route path="/portal/me" element={<CustomerPortalProfilePage />} />
      <Route path="/order" element={<StorefrontPage />} />
      <Route path="/order/track/:orderId" element={<TrackOrderPage />} />
      <Route path="/order/orders" element={<MyOrdersPage />} />
      {STAFF_ROUTES.map(({ path, perm }) => {
        const Page = STAFF_PAGES[path];
        return (
          <Route
            key={path}
            path={path}
            element={
              <RequireAuth>
                <RequirePermission anyOf={perm}>
                  <Page />
                </RequirePermission>
              </RequireAuth>
            }
          />
        );
      })}
      <Route
        path="*"
        element={
          <RequireAuth>
            <NotFound />
          </RequireAuth>
        }
      />
    </Routes>
  );
}
