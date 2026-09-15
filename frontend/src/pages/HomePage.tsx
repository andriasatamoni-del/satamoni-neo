import { Link } from "react-router-dom";
import { useAuth } from "../shared/auth/AuthContext";

export function HomePage() {
  const { user, logout } = useAuth();

  return (
    <div style={{ maxWidth: 640, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h1>Satamoni Neo</h1>
      <p>
        أهلاً <strong>{user?.name}</strong> ({user?.role})
      </p>
      <ul>
        <li><Link to="/crm">متابعة العملاء والشكاوى (CRM)</Link></li>
        <li><Link to="/branches">الفروع</Link></li>
        <li><Link to="/inventory">المخزون</Link></li>
      </ul>
      <button onClick={logout} style={{ padding: "8px 16px" }}>
        تسجيل خروج
      </button>
    </div>
  );
}
