import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./shared/auth/AuthContext";
import { AppShell } from "./shared/ui/AppShell";
import { LoginPage } from "./pages/LoginPage";
import { HomePage } from "./pages/HomePage";
import { CrmPage } from "./pages/CrmPage";
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
import { TreasuriesPage } from "./pages/TreasuriesPage";
import { MyProfilePage } from "./pages/MyProfilePage";
import { AuditLogPage } from "./pages/AuditLogPage";
import { RateOrderPage } from "./pages/RateOrderPage";
import { PrintingPage } from "./pages/PrintingPage";
import { PosSettingsPage } from "./pages/PosSettingsPage";

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
  return <AppShell>{children}</AppShell>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/rate/:orderId" element={<RateOrderPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <HomePage />
          </RequireAuth>
        }
      />
      <Route
        path="/crm"
        element={
          <RequireAuth>
            <CrmPage />
          </RequireAuth>
        }
      />
      <Route
        path="/whatsapp"
        element={
          <RequireAuth>
            <WhatsappPage />
          </RequireAuth>
        }
      />
      <Route
        path="/branches"
        element={
          <RequireAuth>
            <BranchesPage />
          </RequireAuth>
        }
      />
      <Route
        path="/inventory"
        element={
          <RequireAuth>
            <InventoryPage />
          </RequireAuth>
        }
      />
      <Route
        path="/catalog"
        element={
          <RequireAuth>
            <CatalogPage />
          </RequireAuth>
        }
      />
      <Route
        path="/production"
        element={
          <RequireAuth>
            <ProductionPage />
          </RequireAuth>
        }
      />
      <Route
        path="/procurement"
        element={
          <RequireAuth>
            <ProcurementPage />
          </RequireAuth>
        }
      />
      <Route
        path="/orders"
        element={
          <RequireAuth>
            <OrdersPage />
          </RequireAuth>
        }
      />
      <Route
        path="/kds"
        element={
          <RequireAuth>
            <KdsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/delivery"
        element={
          <RequireAuth>
            <DeliveryPage />
          </RequireAuth>
        }
      />
      <Route
        path="/accounting"
        element={
          <RequireAuth>
            <AccountingPage />
          </RequireAuth>
        }
      />
      <Route
        path="/treasuries"
        element={
          <RequireAuth>
            <TreasuriesPage />
          </RequireAuth>
        }
      />
      <Route
        path="/payment-control"
        element={
          <RequireAuth>
            <PaymentControlPage />
          </RequireAuth>
        }
      />
      <Route
        path="/hr-payroll"
        element={
          <RequireAuth>
            <HrPayrollPage />
          </RequireAuth>
        }
      />
      <Route
        path="/printing"
        element={
          <RequireAuth>
            <PrintingPage />
          </RequireAuth>
        }
      />
      <Route
        path="/users"
        element={
          <RequireAuth>
            <UsersPage />
          </RequireAuth>
        }
      />
      <Route
        path="/me"
        element={
          <RequireAuth>
            <MyProfilePage />
          </RequireAuth>
        }
      />
      <Route
        path="/audit-log"
        element={
          <RequireAuth>
            <AuditLogPage />
          </RequireAuth>
        }
      />
      <Route
        path="/pos-settings"
        element={
          <RequireAuth>
            <PosSettingsPage />
          </RequireAuth>
        }
      />
    </Routes>
  );
}
