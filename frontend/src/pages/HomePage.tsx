import { useAuth } from "../shared/auth/AuthContext";

export function HomePage() {
  const { user, logout } = useAuth();

  return (
    <div style={{ maxWidth: 640, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h1>Satamoni Neo</h1>
      <p>
        أهلاً <strong>{user?.name}</strong> ({user?.role})
      </p>
      <p>ده placeholder home page - أول bounded context هيتبني هنا هو CRM &amp; Complaints.</p>
      <button onClick={logout} style={{ padding: "8px 16px" }}>
        تسجيل خروج
      </button>
    </div>
  );
}
