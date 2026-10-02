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
   - `FRONTEND_ORIGIN` = رابط الفرونت إند بتاع الخطوة 3 بالظبط (مثلًا `https://satamoni-neo-frontend.onrender.com`،
     من غير `/` في الآخر). من غيره الـCORS بيسمح لـ`localhost:5173` بس وتسجيل الدخول من الرابط الحقيقي هيفشل.
     لو في أكتر من رابط افصلهم بفاصلة.
   - `ACCOUNTING_ENFORCEMENT` = `strict` (الافتراضي لو مش محدد - **مطلوب في الإنتاج**، Phase 3.1): القيد المحاسبي التلقائي
     جزء من نفس transaction العملية؛ لو الشجرة المحاسبية ناقصة العملية بتترفض (503) ومفيش حاجة بتتكتب. `deferred` للانتقال/الاستيراد بس
     (القيد بيتأجّل ويظهر في `GET /accounting/reports/journal-coverage` وتنبيه Action Center، والإصلاح بـ`POST /accounting/repair/journals`).
     التفاصيل الكاملة والـrunbook: `backend/docs/PHASE31_REMEDIATION.md`.
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
6. **Redirects/Rewrites** (لازم - من غيرها أي رابط غير `/` زي `/login` بيرجّع 404): في صفحة السيرفس
   نفسه، تبويب **Redirects/Rewrites → Add Rule**:
   - Source: `/*`
   - Destination: `/index.html`
   - Action: **Rewrite** (مش Redirect)
7. Deploy. الفرونت بيكلّم الباك إند مباشرة - اتأكد إن `FRONTEND_ORIGIN` في الباك إند (الخطوة 2) هو نفس رابط الفرونت ده.

## 3.5 النسخ الاحتياطي

قبل أي بيانات حقيقية: فعّل النسخ الاحتياطي في لوحة Render للقاعدة (خطة مدفوعة)، وضيف secret `DATABASE_URL`
على GitHub عشان النسخة اليومية المستقلة تشتغل. التفاصيل في `backend/docs/BACKUP_AND_RECOVERY.md`.

## 3.6 الخدمات الاختيارية (كلها مقفولة لحد ما تفعّلها)

كل واحدة شغّالة في الكود، ومن غير مفاتيحها الشاشة بتقول صراحة إنها مش متوصّلة (مفيش حاجة بتقع):

| الخدمة | متغيرات الباك إند على Render | التفعيل | التفاصيل |
|---|---|---|---|
| موقع الطلب أونلاين (`/order`) + نقاط الولاء + صور المنيو | مفيش | إعدادات النظام ← موقع الطلب أونلاين، وشاشة نقاط الولاء | `backend/docs/STOREFRONT.md` |
| بوت واتساب/ماسنجر/إنستجرام | `GEMINI_API_KEY`، `META_APP_SECRET`، `META_VERIFY_TOKEN`، `WHATSAPP_ACCESS_TOKEN`، `WHATSAPP_PHONE_NUMBER_ID`، `META_PAGE_ACCESS_TOKEN`، اختياري `WHATSAPP_STAFF_NOTIFY_NUMBER` | إعدادات النظام ← بوت الرد الآلي | `backend/docs/WHATSAPP-BOT.md` |
| SMS تأكيد الطلب وطلب التقييم | `SMS_WEBHOOK_URL`، اختياري `SMS_WEBHOOK_AUTH_HEADER` و`PUBLIC_APP_URL` | إعدادات النظام ← رسايل SMS | `backend/docs/WHATSAPP-BOT.md` |
| النسخ الاحتياطي اليومي | secret في GitHub اسمه `DATABASE_URL` (External URL) | تلقائي كل يوم | `backend/docs/BACKUP_AND_RECOVERY.md` |

## 4. الاستيراد النهائي (قبل التحويل الفعلي مباشرة)

نفس السكريبتات المحلية، بس ضد `DATABASE_URL` بتاع الإنتاج و`LEGACY_DATABASE_URL` بتاع أحدث نسخة من
بيانات الريبو القديم - بالترتيب ده بالظبط (كل واحد بيعتمد على اللي قبله):

```
scripts/import-branches-from-legacy.ts
scripts/import-users-from-legacy.ts
scripts/import-crm-from-legacy.ts
scripts/import-inventory-from-legacy.ts
scripts/import-catalog-from-legacy.ts
scripts/import-procurement-from-legacy.ts
scripts/import-orders-from-legacy.ts
scripts/import-drivers-from-legacy.ts
scripts/import-accounting-from-legacy.ts
scripts/import-payment-control-from-legacy.ts
scripts/import-hr-payroll-from-legacy.ts
```

كل سكريبت idempotent (مجرّب طول الجلسة دي) - ممكن تعيد تشغيلهم كلهم تاني لو احتجت، من غير ما يكرروا بيانات.

**فين تشغّلهم؟** الباك إند على الخطة المجانية (Free) في Render مفيهوش SSH/Shell (زي ما اتأكد وقت
النشر الحقيقي)، وبيئة تطوير Claude غالبًا محظور عليها اتصال TCP مباشر لقاعدة بيانات خارجية (HTTPS بس
مسموح). أسهل طريقة موثوقة: **GitHub Actions** (الملف `.github/workflows/maintenance-operation.yml`).
> ⚠️ (Phase 3.1 / BL-14) الـworkflow القديم `run-script.yml` اتحذف: كان بيقبل مسار سكريبت حر وبيشغّله بأسرار الإنتاج.
> الجديد بياخد **اختيار من قائمة ثابتة** بس، ومربوط بـEnvironment اسمه `production-maintenance` لازم يتضبط بمراجِع
> إلزامي (راجع `backend/docs/SECURITY_HARDENING.md`). ملحوظة: مفيش سكريبت بيعمل حساب أدمن تجريبي بباسورد ثابت بعد دلوقتي.

1. على GitHub: **Settings → Environments → production-maintenance** → أضف مراجِعًا إلزاميًا، وحط الـsecrets
   `DATABASE_URL` (الـExternal Database URL) و`LEGACY_DATABASE_URL` جوّه الـEnvironment ده (مش على مستوى الريبو).
2. تبويب **Actions → Approved maintenance operation → Run workflow**. اختار `operation` (مثلًا `import-branches`)
   واستنى موافقة المراجِع. كرر لكل عملية بالترتيب اللي فوق، واحدة بعد التانية.
3. البدائل: لو عندك Node.js على جهازك الشخصي، تقدر تشغّل نفس الأوامر محليًا (`export DATABASE_URL=...
   PGSSL=true && npx ts-node scripts/...`) لأن جهازك الشخصي مالوش نفس القيد. أو ترقية مؤقتة لخطة مدفوعة
   على Render بتديك Shell access.

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
