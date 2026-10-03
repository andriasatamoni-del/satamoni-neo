// رسائل الأخطاء الموحّدة للواجهة (403 / 409 / 503) - كل الصفحات بتعرض ApiError.message كما هو، فالصياغة هنا مرة واحدة.
// الباك إند بيرجّع رسالة عربي واضحة في أغلب الحالات (DomainError / GlobalExceptionFilter) فبنفضّلها؛
// الرسالة الافتراضية بتتستخدم بس لما السيرفر ما يرجّعش رسالة عربي (رد الإنجليزي بتاع NestJS "Forbidden resource"،
// أو رد HTML من البروكسي وقت إعادة تشغيل الخدمة).

export type ApiErrorKind = "forbidden" | "conflict" | "unavailable" | "other";

const ARABIC = /[؀-ۿ]/;

export function apiErrorKind(status: number): ApiErrorKind {
  if (status === 403) return "forbidden";
  if (status === 409) return "conflict";
  if (status === 503) return "unavailable";
  return "other";
}

const FALLBACK: Record<Exclude<ApiErrorKind, "other">, string> = {
  forbidden: "معندكش صلاحية تعمل الإجراء ده. لو محتاجه، اطلب الصلاحية من المدير",
  conflict: "الحالة الحالية مش بتسمح بالإجراء ده، أو حد تاني غيّرها في نفس الوقت",
  unavailable: "الخدمة مش متاحة مؤقتًا",
};

const HINT: Record<Exclude<ApiErrorKind, "other">, string> = {
  forbidden: "",
  conflict: "حدّث الصفحة وراجع الحالة الحالية قبل ما تعيد المحاولة",
  unavailable: "جرّب تاني كمان شوية، ولو المشكلة فضلت بلّغ المدير",
};

// الرسالة اللي بتتعرض للمستخدم. serverMessage فاضية أو مش عربي => الرسالة الافتراضية للحالة.
export function friendlyErrorMessage(status: number, serverMessage: string | null | undefined): string {
  const kind = apiErrorKind(status);
  if (kind === "other") return serverMessage || `فشل الطلب (${status})`;

  const base = serverMessage && ARABIC.test(serverMessage) ? serverMessage : FALLBACK[kind];
  const hint = HINT[kind];
  // مفيش داعي نكرر التلميح لو الرسالة نفسها فيها توجيه (مثلًا "أعد المحاولة" أو "راجع ..." أو "لازم المحاسب ...")
  if (!hint || /أعد المحاولة|راجع|حدّث|بلّغ|لازم المحاسب/.test(base)) return base;
  return `${base} - ${hint}`;
}
