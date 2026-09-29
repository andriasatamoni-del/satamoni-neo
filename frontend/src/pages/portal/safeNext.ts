import { useSearchParams } from "react-router-dom";

// ?next= بعد الدخول/التسجيل (مثلًا يرجع لموقع الطلب) - مسار داخلي بس، عشان محدش يعمل لينك دخول
// بيحوّل العميل لموقع تاني بعد ما يسجّل
export function useSafeNext(fallback = "/portal/me"): string {
  const [params] = useSearchParams();
  const next = params.get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}
