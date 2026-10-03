import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./shared/auth/AuthContext";
import { App } from "./App";
import { ApiError } from "./shared/api/client";

// 403/409 والـ4xx عمومًا قرار نهائي من السيرفر - إعادة المحاولة التلقائية بتأخّر ظهور الرسالة ~7 ثواني من غير فايدة.
// 503 (خدمة/دليل حسابات مش جاهز) ممكن يتحل لوحده فنحاول مرة واحدة بس. باقي الأخطاء (شبكة/5xx) على الافتراضي (3 مرات)
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (error instanceof ApiError) {
          if (error.status === 503) return failureCount < 1;
          if (error.status >= 400 && error.status < 500) return false;
        }
        return failureCount < 3;
      },
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);

// وضع الكاشير الأوفلاين (OFFLINE) - بيكاش نسخة من الواجهة عشان صفحة الطلبات تقدر تفتح حتى من غير نت.
// مش موجود في المتصفحات القديمة/بعض بيئات الاختبار - بنتأكد إنه موجود الأول
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // فشل التسجيل مش خطأ يوقف التطبيق - التطبيق يشتغل عادي أونلاين، بس من غير كاش أوفلاين للواجهة
    });
  });
}
