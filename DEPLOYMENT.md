# نشر satamoni-neo على استضافة حقيقية

الخطوات دي بتغطي **Phase 5** من خطة إعادة البناء (`docs`/الخطة المعتمدة): الاستضافة الفعلية، الاستيراد
النهائي، وتحويل الاستخدام الفعلي. الخطوات هنا بتفترض Render (زي ما محدد في خطة إعادة البناء)، بس
تنطبق بنفس المنطق على أي مزوّد Node + Postgres تاني.

**ملحوظة مهمة**: `render.yaml` في جذر الريبو مجهود مبذول بأفضل معرفة متاحة، لكن مش متحقَّق منه فعليًا
ضد Render (egress لـrender.com كان محظور وقت كتابته). جرّب "New + → Blueprint" الأول - لو اشتغل
وفّرلك وقت. لو رفض أو فيه مشكلة، اتبع الخطوات اليدوية تحت - دي مضمونة (build/start commands اتجرّبت
فعليًا محليًا زي إنتاج حقيقي قبل ما تتكتب هنا).

## 1. قاعدة البيانات

1. على Render: **New + → PostgreSQL**. اختار اسم (`satamoni-neo-db`) ومنطقة قريبة من مستخدمينك.
2. بعد ما تتعمل، هتلاقي **Internal Database URL** و**External Database URL** في صفحتها.
   استخدم **Internal** للباك إند (نفس شبكة Render الداخلية - مفيش داعي لـSSL).

## 2. الباك إند (Web Service)

1. **New + → Web Service**، اربطه بريبو `satamoni-neo` على GitHub.
2. **Root Directory**: `backend`
3. **Build Command**: `npm install && npm run build`
4. **Start Command**: `npm run migrate && npm run start`
   (بيشغّل الـmigrations تلقائي قبل كل start - آمن لأنها idempotent، Kysely بيتتبّع أي migration
   اتنفذت فعلًا)
5. **Environment Variables**:
   - `DATABASE_URL` = الـInternal Database URL بتاع الخطوة 1
   - `PGSSL` = `false` (Internal URL مش محتاج SSL - لو استخدمت External حدّدها `true`)
   - `JWT_SECRET` = قيمة عشوائية طويلة حقيقية (Render بيقدر يولّدها تلقائي لو ضغطت "Generate")
   - `JWT_EXPIRES_IN` = `12h`
6. Deploy. لما يخلص، هتلاقي رابط زي `https://satamoni-neo-backend.onrender.com` - اختبره:
   `curl https://satamoni-neo-backend.onrender.com/health` المفروض يرجّع `{"status":"ok"}`.

## 3. الفرونت إند (Static Site)

1. **New + → Static Site**، نفس الريبو.
2. **Root Directory**: `frontend`
3. **Build Command**: `npm install && npm run build`
4. **Publish Directory**: `dist`
5. **Environment Variables**:
   - `VITE_API_BASE_URL` = رابط الباك إند بتاع الخطوة 2 بالظبط (من غير `/` في الآخر) - مثلًا
     `https://satamoni-neo-backend.onrender.com`
6. Deploy. الفرونت بيكلّم الباك إند مباشرة (CORS مفعّل بالفعل في `main.ts`).

## 4. الاستيراد النهائي (قبل التحويل الفعلي مباشرة)

نفس السكريبتات المحلية، بس ضد `DATABASE_URL` بتاع الإنتاج و`LEGACY_DATABASE_URL` بتاع أحدث نسخة من
بيانات الريبو القديم - بالترتيب ده بالظبط (كل واحد بيعتمد على اللي قبله):

```bash
cd backend
export DATABASE_URL="<External Database URL بتاع satamoni-neo-db>"
export LEGACY_DATABASE_URL="<رابط قاعدة بيانات الريبو القديم الحقيقية>"
export PGSSL=true   # External URL محتاج SSL

npx ts-node scripts/import-branches-from-legacy.ts
npx ts-node scripts/import-users-from-legacy.ts
npx ts-node scripts/import-crm-from-legacy.ts
npx ts-node scripts/import-inventory-from-legacy.ts
npx ts-node scripts/import-catalog-from-legacy.ts
npx ts-node scripts/import-procurement-from-legacy.ts
npx ts-node scripts/import-orders-from-legacy.ts
npx ts-node scripts/import-drivers-from-legacy.ts
npx ts-node scripts/import-accounting-from-legacy.ts
npx ts-node scripts/import-payment-control-from-legacy.ts
npx ts-node scripts/import-hr-payroll-from-legacy.ts
```

كل سكريبت idempotent (مجرّب طول الجلسة دي) - ممكن تعيد تشغيلهم كلهم تاني لو احتجت، من غير ما يكرروا بيانات.

## 5. اختبار دخان على الإنتاج

كرّر نفس معاينة Playwright اللي بنعملها محليًا، بس على الروابط الحقيقية: تسجيل دخول، تسجيل طلب، التأكد
إن قيد البيع اترحّل في المحاسبة، إلخ. لو معندكش وقت لده، على الأقل جرّب تسجيل دخول ومسار واحد أساسي يدويًا
من المتصفح.

## 6. تحويل الاستخدام الفعلي

- بلّغ الموظفين بالرابط الجديد (رابط الفرونت إند بتاع الخطوة 3).
- النظام القديم (`satamoni-backend`) يفضل شغال - متقفلوش، سيبه fallback لحد ما تطمن.

## 7. فترة الأمان والإيقاف

- سيب النظام الجديد شغال فترة (أسبوع مثلًا) وراقب الأخطاء/الشكاوى.
- بعد ما تطمن، حوّل النظام القديم لـread-only (أو أوقف كتابة بيانات جديدة عليه) بدل ما توقفه فجأة.
- لما الثقة تكتمل، تقدر توقف النظام القديم نهائيًا.
