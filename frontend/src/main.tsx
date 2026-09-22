import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./shared/auth/AuthContext";
import { App } from "./App";

const queryClient = new QueryClient();

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
