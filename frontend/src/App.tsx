import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./shared/auth/AuthContext";
import { LoginPage } from "./pages/LoginPage";
import { HomePage } from "./pages/HomePage";
import { CrmPage } from "./pages/CrmPage";
import { BranchesPage } from "./pages/BranchesPage";
import { InventoryPage } from "./pages/InventoryPage";
import { CatalogPage } from "./pages/CatalogPage";
import { ProcurementPage } from "./pages/ProcurementPage";

function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <p style={{ textAlign: "center", marginTop: 80 }}>بيتم التحميل...</p>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
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
        path="/procurement"
        element={
          <RequireAuth>
            <ProcurementPage />
          </RequireAuth>
        }
      />
    </Routes>
  );
}
