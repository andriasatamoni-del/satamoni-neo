// قواعد بيانات Postgres المُدارة (Render وغيرها) بتحتاج SSL للاتصال من برّه شبكتها الداخلية - محلي
// (Docker/localhost) عادة من غيره. PGSSL=true بيفعّله صراحة (بدل ما نخمّن من NODE_ENV)، وrejectUnauthorized:
// false لأن مزوّدين الاستضافة المُدارة غالبًا بيستخدموا شهادات موقّعة ذاتيًا للاتصال الداخلي
export function pgSslOption(): { rejectUnauthorized: false } | undefined {
  return process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined;
}
