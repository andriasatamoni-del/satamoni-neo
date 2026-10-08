# النسخ الاحتياطي والاسترجاع

## الحالة الفعلية (اقرأها الأول)

> **لحد دلوقتي ما ثبتش نجاح أي نسخة احتياطية للإنتاج.** آخر 4 تشغيلات مجدولة لـ`Daily database backup + restore drill`
> (30/9 → 3/10/2026) **كلها فشلت**: التلاتة الأولى على الـworkflow القديم (خطوة `Check DATABASE_URL secret`)، والرابعة على الجديد
> في أول خطوة تحقق لأن **`BACKUP_ENCRYPTION_KEY` مش متضاف**. الـworkflow بيفشل بصوت عالي عن قصد، بس وقتها مكانش فيه تنبيه فالفشل عدّى من غير ما حد يلاحظ. (اتضاف بعد كده job تنبيه بيفتح issue تلقائي - راجع "التنبيه عند الفشل" تحت. لسه ما اتجرّبش على GitHub.)
> يعني: مفيش نسخة إنتاج مشفّرة، ومفيش تمرين استرجاع اتعمل على بيانات حقيقية. **متعتبرش إن فيه نسخ احتياطية** لحد ما تنفّذ "قبل
> أول تجربة حقيقية" تحت وتشوف التشغيل بيخضر وبتطلع نسخة (artifact) وتجرّب تسترجعها.
>
> التعديلات الأمنية الأخيرة (تشغيل من `main` بس، حواجز تمرين الاسترجاع، بصمة SHA-256 للنسخة المشفّرة) اتعمل لها اختبارات محلية، لكن
> **الـworkflow نفسه ما اتشغّلش على GitHub بعد التعديلات دي**، ومفيش حاجة اتجرّبت على قاعدة الإنتاج.

## الطبقات

1. **النسخ الاحتياطي بتاع مزوّد قاعدة البيانات نفسه (الأساس)** - على Render، الخطط المدفوعة لـPostgres
   فيها نسخ تلقائي يومي + Point-In-Time Recovery (استرجاع لأي لحظة، مش بس آخر نسخة يومية). ده لازم يتفعّل
   قبل التشغيل الفعلي. **خطة Free ملهاش نسخ احتياطي خالص وقاعدتها بتنتهي بعد فترة** - متتشغلش عليها بيانات حقيقية.
2. **نسخة يومية مستقلة عن Render (الطبقة دي)** - `pg_dump` يومي عن طريق GitHub Actions، وتمرين استرجاع
   حقيقي على كل نسخة. مفيدة لو حساب Render نفسه حصله حاجة، أو لنقل الاستضافة.

## الـworkflow بيعمل إيه بالظبط

الملف: `.github/workflows/db-backup.yml`. بيشتغل كل يوم 01:07 UTC (GitHub ممكن يتأخر ساعات في الجدولة) أو يدوي، ومربوط بالـEnvironment
`production-backup`. **الـjob ده بيشتغل من `main` بس** (`if: github.ref == 'refs/heads/main'` على مستوى الـjob): أي تشغيل يدوي من فرع تاني
بيتخطّى الـjob كله، يعني قبل الـenvironment والأسرار وحاوية Postgres، فمفيش خطوة بتلمس سر أو قاعدة بيانات. اتأكد منه باختبار
(`test/unit/security/backup-workflow.spec.ts`).

> ⚠️ تشغيل من فرع تاني بيظهر **أخضر/Skipped** في تبويب Actions. "Skipped" مش معناه إن النسخة اتعملت: دايمًا اتأكد إن الـartifact ظهر.

1. **تحقق من الإعداد**: لو `DATABASE_URL` أو `BACKUP_ENCRYPTION_KEY` (≥ 32 حرف) ناقصين الـjob **بيفشل بصوت عالي**. القيم عمرها ما بتتطبع.
2. `pg_dump -Fc` + تحقق: حجم أدنى، `pg_restore --list` بيقرا الفهرس كله (بيكشف النسخة المقطوعة)، وملف `.sha256` للنسخة غير المشفّرة (بيتمسح بعد التشفير).
3. **تمرين استرجاع** على سيرفر Postgres مؤقت جوّه الـjob (`localhost`، مش الإنتاج)، بيتأكد من الجداول/البيانات/اتزان القيود،
   وبيقارن النسخة المسترجعة بالأصل (قراءة `SELECT` بس)، وبيشغّل `migrateToLatest` على النسخة المسترجعة.
4. **تشفير** (`gpg --symmetric --cipher-algo AES256`) وإثبات إن المفتاح بيفك التشفير ويرجّع نفس البايتات، وبعدين:
   * **SHA-256 للملف المشفّر نفسه** بيتكتب في `*.dump.gpg.sha256` (صيغة `sha256sum`) ويتفحص بـ`sha256sum --check`.
   * النسخة غير المشفّرة وبصمتها بيتمسحوا (الـplaintext عمره ما بيخرج من الـjob).
5. **خطوة تحقق من غير أسرار** (`verify-encrypted-backup.ts`): بتفحص كل `*.dump.gpg` ضد بصمته، وبتفشّل الـjob لو فضل في المجلد أي ملف
   غير `*.dump.gpg` و`*.dump.gpg.sha256` (يعني أي plaintext).
6. **تخزين مستقل (اختياري لكن مطلوب للتشغيل الحقيقي)**: لو `BACKUP_S3_BUCKET` وباقي الأسرار متضافة، النسخة المشفرة **وبصمتها** بيتنسخوا
   لتخزين S3-compatible مستقل وبتتطبق سياسة الاحتفاظ (والبصمة بتتمسح مع نسختها). لو مش متضاف: تحذير بس، و**الـartifacts لوحدها (30 يوم) مش استراتيجية طويلة المدى**.
7. **رفع الـartifact** `satamoni-neo-backup-encrypted-<run_id>`: النسخة المشفّرة + بصمتها **فقط**. ملف الـdump غير المشفّر عمره ما بيترفع.

8. **التنبيه عند الفشل** (job منفصل اسمه `report`، تفاصيله في قسم "التنبيه عند الفشل" تحت).

صلاحيات الـ`GITHUB_TOKEN` للـbackup job: `contents: read` فقط (على مستوى الـworkflow والـjob)، وcheckout بـ`persist-credentials: false`. مفيش أقل من كده
ينفع (الـcheckout محتاج قراءة المحتوى).

## الأسرار المطلوبة (جوّه الـEnvironment `production-backup`)

| الاسم | مطلوب؟ | ملاحظات |
|---|---|---|
| `DATABASE_URL` | **نعم** | الـ**External** Database URL بتاع Render (الـInternal مش بيوصل من GitHub). يفضّل role قراءة فقط. |
| `BACKUP_ENCRYPTION_KEY` | **نعم** (مش متضاف لحد دلوقتي) | 32 حرف على الأقل. ولّده بـ`openssl rand -base64 48` وخزّنه في password manager. **من غيره النسخ مش قابلة للاسترجاع.** |
| `BACKUP_S3_BUCKET`، `BACKUP_S3_ACCESS_KEY_ID`، `BACKUP_S3_SECRET_ACCESS_KEY`، `BACKUP_S3_REGION` | اختياري (موصى به جدًا) | تخزين مستقل. من غيره الاحتفاظ 30 يوم بس. |
| `BACKUP_S3_ENDPOINT` | فقط لو التخزين مش AWS | |
| `BACKUP_DB_SSL_CA` | اختياري (secret) | شهادة الـCA (PEM، **الشهادة بس مش المفتاح الخاص**) لقاعدة المصدر لو شهادة مزوّد القاعدة مش من CA عام. لو موجودة تبقى هي الوحيدة المقبولة. شوف "التحقق من شهادة قاعدة البيانات". |
| `BACKUP_DB_TLS_MODE` | اختياري (**Variable** مش secret) | الافتراضي `verify`. `insecure-skip-verify` خروج صريح مؤقت من التحقق (بيطلع تحذير). أي قيمة تانية بتفشّل الـjob. |

## إعدادات GitHub اللي لازم تعملها يدويًا (الكود مش بيفرضها)

وجود سطر `environment: production-backup` في الـworkflow **مش دليل** إن الحماية شغّالة: لو الـEnvironment مش معمول، GitHub بيعمله تلقائي
**من غير أي قواعد** والـjob بيشتغل من غير موافقة. وأنا (الكود) مقدرش أقرا إعدادات الـEnvironments من هنا، فاتأكد منهم بنفسك:

1. **Settings → Environments → `production-backup`**:
   * **Required reviewers**: مراجِع واحد على الأقل غير اللي بيشغّل الـworkflow، وفعّل **Prevent self-review**.
   * **Deployment branches and tags** → *Selected branches and tags* → أضف **`main` بس**. (ده بيحمي لو حد عدّل الـworkflow في فرع تاني؛ الشرط `if` في الملف طبقة تانية مش بديل.)
   * **Environment secrets**: `DATABASE_URL` و`BACKUP_ENCRYPTION_KEY` (والـS3) **هنا**، واحذف أي نسخة منهم على مستوى الـRepository.
2. **Settings → General**: حوّل الريبو **Private**. (بقى public دلوقتي: اللوجات ظاهرة للكل.)
3. **Settings → Actions → General**: *Workflow permissions* = Read repository contents، وفعّل الموافقة على workflows الجاية من متعاونين خارجيين.
4. **Settings → Branches**: حماية `main` (pull request + review إلزامي)، عشان ملف الـworkflow والسكريبتات متتعدلش من غير مراجعة.
5. **تنبيه الفشل**: فعّل **Issues** للريبو (Settings → General → Features → Issues)، واعمل **Watch** للريبو (Watch → Custom → Issues، أو All activity) عشان إيميل الـissue يوصلك. وفعّل إشعارات GitHub لفشل الـworkflows (Profile → Settings → Notifications → Actions). من غير Issues مفعّلة، job التنبيه نفسه هيفشل.
6. اتأكد إن المستخدمين اللي عندهم write على الريبو هم اللي بتثق فيهم: أي حد عنده write يقدر يطلب تشغيل الـworkflow (بيستنى موافقة المراجِع).

## التنبيه عند الفشل

الـjob `report` في نفس الـworkflow (بيشتغل بعد `backup`، ومن `main` بس):

* لو النسخة **فشلت أو اتلغت**: بيفتح issue واحد عنوانه **`ALERT: scheduled database backup failed`** (فيه رابط الـrun بس). لو الـissue مفتوح أصلًا بيضيف تعليق بدل ما يفتح تاني.
* لو نسخة **نجحت** وفيه issue مفتوح: بيعلّق عليه ويقفله. (اتأكد برضه إن الـartifact وبصمته ظهروا.)
* لو الـbackup job اتخطّى (فرع غير `main`): مبيعملش حاجة.
* **صلاحياته**: `issues: write` بس. مفيش أسرار ولا environment ولا checkout. الـbackup job نفسه لسه `contents: read` بس.
* الـissue **مفيهوش لوج ولا أسرار**. لو الريبو public لسه، العنوان ورابط الـrun ظاهرين للكل.

اللي مش بيغطيه التنبيه ده: لو الـworkflow ماشتغلش أصلًا (الجدولة اتوقفت: GitHub بيوقف الـworkflows المجدولة في الريبو الـpublic بعد 60 يوم من غير نشاط، أو الـworkflow اتعطّل، أو عطل عند GitHub)، مفيش run يفتح issue. عشان كده: افتح تبويب Actions بشكل دوري وتأكد إن آخر run مجدول حصل وطلّع artifact.

## التحقق من شهادة قاعدة البيانات (TLS)

اتصال الـworkflow بقاعدة الإنتاج (للنسخة، وللمقارنة، وللفحص ببصمة السيرفر) **بيتحقق من الشهادة** (سلسلة الثقة + اسم الـhost):
`pg_dump` بـ`sslmode=verify-full`، والباقي بـ`rejectUnauthorized: true`. قبل كده كان `require` و`rejectUnauthorized: false`، يعني التشفير شغّال لكن أي حد في الطريق كان يقدر ينتحل السيرفر.

* **الافتراضي**: الشهادة لازم تتسلسل لـCA موجود عند الـrunner (CA عام). ده كل اللي محتاجه لو Render بتستخدم شهادة من CA عام.
* **لو الشهادة مش من CA عام** (الفشل هيكون واضح في خطوة Backup: `certificate verify failed` أو `self-signed certificate` أو `unable to get local issuer certificate`): ضيف شهادة الـCA في secret اسمه `BACKUP_DB_SSL_CA`. بتتحوّل لملف جوّه الـjob وتبقى هي **الوحيدة** المقبولة (pinning).
* **اسم الـhost لازم يطابق الشهادة**: استخدم الـExternal URL بالاسم اللي في لوحة Render، مش عنوان IP ولا alias.
* **خروج مؤقت**: لو محتاج النسخة تشتغل النهارده قبل ما تظبط الـCA، اعمل Variable (مش secret) باسم `BACKUP_DB_TLS_MODE` قيمته `insecure-skip-verify`. الـworkflow هيطلّع `::warning::` في كل تشغيل. شيله أول ما تثبّت الـCA.

**إزاي تعرف شهادة السيرفر** (من جهازك؛ ده handshake TLS بس، من غير تسجيل دخول ولا كلمة سر، بس برضه اتصال بسيرفر الإنتاج فنفّذه إنت):

```bash
HOST=<اسم الـhost من الـExternal URL>
openssl s_client -starttls postgres -connect "$HOST:5432" -servername "$HOST" -showcerts </dev/null 2>/dev/null | openssl x509 -noout -issuer -subject -dates -ext subjectAltName
```

لو الـissuer جهة معروفة (CA عام) يبقى الافتراضي كفاية. لو سلسلة خاصة، نزّل شهادة الـCA من لوحة المزوّد أو من وثائقه (مش من نفس الاتصال بدون تحقق، لأن ده بيلغي الفايدة) وضيفها في `BACKUP_DB_SSL_CA`. **ما قدرتش أتأكد من نوع شهادة Render** (وثائقهم مش متاحة من البيئة اللي اشتغلت فيها)، فأول تشغيل هو اللي هيبيّن.

التشغيل اليدوي المحلي: `PGSSL=true` بقت معناها `verify-full`. محتاج عميل PostgreSQL 16+ (بيستخدم `sslrootcert=system`)، أو حدد `PGSSLROOTCERT=/path/ca.pem`. للتجاوز المؤقت `BACKUP_DB_TLS_MODE=insecure-skip-verify`.

**خارج النطاق ده**: اتصال التطبيق نفسه (`src/shared/database/pg-ssl.ts`) ومهام الاستيراد (`maintenance-operation.yml`) لسه بيستخدموا `rejectUnauthorized: false`. على Render الباك إند بيتصل بالـInternal URL من غير SSL، فمش متأثر؛ مهام الاستيراد بتتصل بالـExternal URL وتحتاج تعديل منفصل.

## تشغيل نسخة يدويًا من GitHub

1. **Actions → Daily database backup + restore drill → Run workflow**، الفرع **`main`**.
2. لو الـEnvironment فيه مراجِع، هو بيوافق من صفحة الـrun.
3. استنى الـjob (الحد الأقصى 45 دقيقة). لازم **كل الخطوات تخضر**، خصوصًا "Restore drill" و"Verify the encrypted files". لو "Restore drill" فشلت، النسخة **مش صالحة** حتى لو الباقي اتنفذ.
4. في صفحة الـrun، قسم **Artifacts**: نزّل `satamoni-neo-backup-encrypted-<run_id>`. جواه `satamoni-neo-YYYYMMDD-HHMMSS.dump.gpg` و`satamoni-neo-YYYYMMDD-HHMMSS.dump.gpg.sha256`.

## التحقق من النسخة المشفّرة (البصمة الأول، وبعدين فك التشفير)

على جهازك، من غير أي اتصال بقاعدة بيانات:

```bash
cd backend && npm ci          # مرة واحدة
# 1) البصمة + إن الملف مش plaintext (ده بيفشل لو بايت واحد اتغيّر)
npm run verify-encrypted-backup -- /path/to/satamoni-neo-YYYYMMDD-HHMMSS.dump.gpg

# 2) شكل التشفير (اختياري): لازم يظهر "cipher 9" (= AES-256) و"mdc_method: 2" (حماية من التعديل)
gpg --batch --no-tty --pinentry-mode cancel --list-packets /path/to/file.dump.gpg 2>&1 | grep -E 'symkey|cipher|mdc_method'
```

بديل من غير Node: `cd /path/to && sha256sum --check --strict file.dump.gpg.sha256`.

فك التشفير (البصمة بتتفحص تاني أوتوماتيك قبل ما gpg يشتغل، والمفتاح بيتقري من الـshell من غير ما يتكتب في أمر ولا في الـhistory):

```bash
read -rs BACKUP_ENCRYPTION_KEY; echo; export BACKUP_ENCRYPTION_KEY    # بتلصق المفتاح من password manager، مش بيظهر
npm run verify-encrypted-backup -- /path/to/file.dump.gpg --decrypt-to /safe/dir/restore.dump
unset BACKUP_ENCRYPTION_KEY
```

* الملف الناتج `restore.dump` **plaintext كامل** (عملاء، رواتب، باسوردات مجزّأة): صلاحياته 0600، احفظه على قرص مشفّر، وامسحه بعد الاستعادة (`shred -u`).
* الأداة بترفض: ملف من غير بصمة، بصمة مش مطابقة (حتى بايت واحد)، ملف plaintext متسمّي `.gpg`، مفتاح أقصر من 32 حرف. ولو حد عدّل الملف وأعاد حساب البصمة، gpg بيكشفه
  (حماية MDC) والأداة بتمسح أي ناتج جزئي.
* مفتاح غلط = فشل ومفيش ملف.

## الاسترجاع على PostgreSQL تجريبي منفصل (من غير لمس الإنتاج)

كل الأوامر داخل container جديد على `127.0.0.1`. مفيش `--clean` ولا `--create` ولا أي رابط للإنتاج. الباسوردات بتتولّد وبتتقري من الـshell عشان متدخلش في الـhistory.

```bash
# 1) سيرفر تجريبي فاضي، كلمة سر عشوائية، مربوط على localhost بس (على بورت غير 5432)
export RESTORE_PGPASS="$(openssl rand -hex 16)"
docker run -d --name satamoni-restore-test -e POSTGRES_PASSWORD="$RESTORE_PGPASS" -p 127.0.0.1:55432:5432 postgres:17
until docker exec satamoni-restore-test pg_isready -U postgres; do sleep 1; done

# 2) حارس أمان: لازم السيرفر جديد وفاضي (الإنتاج هيظهر فيه satamoni_neo)
docker exec satamoni-restore-test psql -U postgres -Atc "select datname from pg_database where not datistemplate"   # المتوقع: postgres فقط

# 3) استعادة (pg_restore 17 اللي جوّه الـcontainer، من غير ما تحتاج client محلي)
docker exec satamoni-restore-test createdb -U postgres satamoni_restore_check
docker exec -i satamoni-restore-test pg_restore --no-owner --no-privileges -U postgres -d satamoni_restore_check < restore.dump 2> restore.err; echo "exit=$?"
wc -l restore.err     # راجعه: تحذيرات roles/extensions مقبولة، أي ERROR على جدول أو بيانات لأ

# 4) تحقق (القسم اللي بعده)
docker exec -i satamoni-restore-test psql -U postgres -d satamoni_restore_check < backend/scripts/backup/verify-restore.sql

# 5) تنظيف
docker rm -f satamoni-restore-test
shred -u restore.dump restore.err 2>/dev/null || rm -f restore.dump restore.err
unset RESTORE_PGPASS
```

**بديل: تمرين الاسترجاع الرسمي** (`restore-drill.ts`) ضد نفس الـcontainer، بعد خطوتي 1 و2 وقبل التنظيف:

```bash
cd backend
export RESTORE_DRILL_DATABASE_URL="postgresql://postgres:${RESTORE_PGPASS}@127.0.0.1:55432/postgres"
npm run restore-drill -- --backup=/safe/dir/restore.dump --keep
unset RESTORE_DRILL_DATABASE_URL
```

محتاج `pg_restore` 17 محلي. **من غير** `RESTORE_DRILL_COMPARE_SOURCE_URL` (دي للـworkflow بس).

### الحواجز في `restore-drill.ts` (اتضافت بعد مراجعة الأمان)

* **`RESTORE_DRILL_DATABASE_URL` إلزامي، ومفيش رجوع لـ`DATABASE_URL`** (كان فيه رجوع تلقائي).
* **الوجهة لازم تكون سيرفر محلي**: `localhost` أو `127.0.0.0/8` أو `::1`. أي host بعيد مرفوض. صيغ الـIP الملتبسة (عشرية/hex/IPv4-mapped/`0.0.0.0`) ومعاملات `?host=`/`?hostaddr=`/`?service=` وسوكيت يونكس ورابط متعدد الـhosts مرفوضين.
* **الوجهة مش نفس سيرفر أي مصدر** (`DATABASE_URL`، `LEGACY_DATABASE_URL`، `RESTORE_DRILL_COMPARE_SOURCE_URL`) **حتى لو اسم القاعدة مختلف**: بنقارن host (بعد التطبيع: `localhost` = `127.0.0.1` = `::1`) وport، مش النص. وفوقيها فحص وقت التشغيل ببصمة السيرفر (`pg_postmaster_start_time`) بيكشف نفس السيرفر لو وصلنا له باسم تاني أو tunnel.
* **`backend/.env` عمره ما بيتقري** في مسار الاسترجاع (مفيش `dotenv`، والسكريبت مش بيستورد `backup.ts`). الوجهة لازم تتحدد في بيئة الـshell صراحة. اتأكد باختبار بيشغّل السكريبت الحقيقي مع `.env` فيه قيم.
* `PGHOSTADDR`/`PGSERVICE`/`PGSERVICEFILE` في بيئتك بتتشال قبل ما `pg_dump`/`pg_restore` يشتغلوا، عشان ميحوّلوش الاتصال بعيد عن الرابط.
* رسائل الرفض مبتطبعش الرابط ولا الـhost ولا الباسورد.
* لو احتجت قاعدة بعيدة مستقبلًا: **مش مفعّل**. التصميم المقترح للمراجعة في `RESTORE_DRILL_REMOTE_TARGET_DESIGN.md`.

## التحقق من سلامة البيانات بعد الاستعادة

الملف `backend/scripts/backup/verify-restore.sql`: استعلامات **قراءة فقط** جوّه `BEGIN TRANSACTION READ ONLY ... ROLLBACK`، وبيرفض يشتغل إلا لو اسم القاعدة فيه
`restore` أو `scratch` أو `drill` أو `test` (يعني لو وجّهته بالغلط لقاعدة التطبيق بيقف في أول أمر). مفيهوش غير `SELECT`، واتأكد منه باختبار.

بيفحص: عدد الجداول والـmigrations، أعداد الصفوف، حداثة آخر order وaudit، اتزان القيود (المتوقع `0` و`t`)، تساوي أرصدة المخزون مع الحركات (`t`)،
constraints/indexes معطوبة، وجود indexes الـPhase 3.1 وtriggers الـaudit، وتوزيع أدوار المستخدمين.

* القسم 6: الـconstraint `customers_loyalty_points_non_negative` ظهوره **متوقع** (migration 056 بتضيفه `NOT VALID` عمدًا). أي حاجة تانية ظهرت = مشكلة.
* قارن الأرقام بالإنتاج: أي رقم **أقل** في النسخة المسترجعة مقبول لو الفرق معاملات اتسجلت بعد الـsnapshot. أي رقم **أكبر** مرفوض.
* مش اتجرّب على نسخة إنتاج (مفيش نسخة لحد دلوقتي)، اتجرّب على قاعدة الاختبار المؤقتة بس.

## تشغيل نسخة محلية يدويًا (للطوارئ)

من غير ما كلمة سر الإنتاج تدخل في الـshell history:

```bash
cd backend
read -rs PROD_DATABASE_URL; echo; export DATABASE_URL="$PROD_DATABASE_URL"; unset PROD_DATABASE_URL    # بتلصق الرابط، مش بيظهر
export PGSSL=true BACKUP_DIR=/safe/encrypted/disk/backups
npm run backup
unset DATABASE_URL
```

(ملحوظة: `backup.ts` بيقرا `backend/.env` لو موجود. ده مسار النسخ بس، مش الاسترجاع.) النسخة الناتجة **غير مشفّرة**: شفّرها بنفس أمر gpg اللي في الـworkflow قبل ما تنقلها لأي مكان.

| المتغير | الافتراضي | الوصف |
|---|---|---|
| `BACKUP_DIR` | `./backups` | مجلد ملفات النسخ (متجاهَل في git) |
| `BACKUP_DAILY_RETENTION_DAYS` | `30` | كل النسخ في النافذة دي بتتحفظ |
| `BACKUP_MONTHLY_RETENTION_MONTHS` | `12` | بعدها أقدم نسخة في كل شهر بس، وبعدها أقدم نسخة في كل سنة للأبد |
| `RESTORE_DRILL_DATABASE_URL` | **مفيش** (إلزامي) | سيرفر Postgres **محلي** مؤقت. مفيش رجوع لـ`DATABASE_URL`. |

الباسورد بيتبعت لـ`pg_dump`/`pg_restore` كمتغير بيئة (`PGPASSWORD`)، مش في سطر الأوامر، عشان ميظهرش في `ps`.

## تمرين الاسترجاع بيتحقق من إيه

1. الحواجز (وجهة محلية، مش نفس سيرفر أي مصدر) **قبل أي اتصال**.
2. سلامة الملف (sha256 + فهرس `pg_restore --list`).
3. إنشاء قاعدة مؤقتة نضيفة باسم فريد، و`pg_restore` للنسخة فيها.
4. الجداول الأساسية موجودة، وفيه بيانات حقيقية (فرع واحد ومستخدم على الأقل).
5. كل القيود المحاسبية المرحّلة/المعكوسة متزنة (مدين = دائن).
6. (في الـworkflow) مقارنة النسخة المسترجعة بالقاعدة الحية: جداول، عدّادات، أرصدة، أدوار، migrations.
7. تشغيل `migrateToLatest` على النسخة المسترجعة - بيثبت إن نسخة قديمة تقدر تتسترجع وتتحدّث للكود الحالي.
8. مسح القاعدة المؤقتة (إلا لو `--keep`).

`exit code` = `0` لو كل الفحوصات نجحت، `1` لو أي حاجة فشلت. المقارنة مع قاعدة حية قد تدي فشل كاذب على نظام مشغول (مثلًا deploy أو مستخدم بدور جديد بين الـdump والمقارنة)؛ لو حصل، راجع الفرق قبل ما تحكم.

## سياسة الاحتفاظ (قابلة للاختبار تشغيليًا)

* كل نسخة في آخر `BACKUP_DAILY_RETENTION_DAYS` (30) يوم بتتحفظ.
* بعدها أقدم نسخة في كل شهر لحد `BACKUP_MONTHLY_RETENTION_MONTHS` (12) شهر.
* بعدها أقدم نسخة في كل سنة للأبد.
* ملفات بأسماء مش مطابقة للنمط عمرها ما بتتمسح.

اختبرها من غير ما تمسح حاجة: `npx ts-node scripts/backup/retention-plan.ts --dir ./backups --now 2026-10-02T00:00:00Z`
(بيطبع KEEP/DELETE/IGNORE). نفس المنطق بيتطبق على قايمة أسماء من S3 (`--names-file ... --suffix .gpg --print-delete`).

## الاسترجاع الفعلي وقت أزمة

1. أوقف الباك إند (Render → Suspend) عشان محدش يكتب بيانات جديدة أثناء الاسترجاع.
2. **الخيار الأول دايمًا**: استرجاع من لوحة Render (PITR) للحظة قبل المشكلة.
3. لو مش متاح: نزّل النسخة، **اتحقق من بصمتها ثم فك تشفيرها** (القسم فوق)، اعمل قاعدة جديدة، و`pg_restore --no-owner --no-privileges -d <new-db> <file.dump>`،
   وبعدين غيّر `DATABASE_URL` في الباك إند للقاعدة الجديدة. أول تشغيل هيطبّق أي migration ناقصة تلقائيًا.
4. شغّل الباك إند، واعمل اختبار دخان (تسجيل دخول + طلب + قيد محاسبي).

## قبل أول تجربة حقيقية (لسه ما اتعملتش)

1. إعدادات GitHub اليدوية فوق (Private + مراجِع + `main` بس + الأسرار جوّه الـEnvironment).
2. إضافة `BACKUP_ENCRYPTION_KEY` و`DATABASE_URL` (External، قاعدة إنتاج فعلية على خطة مدفوعة، إصدار Postgres ≤ 17). لو أول تشغيل فشل في TLS: القسم "التحقق من شهادة قاعدة البيانات".
3. تشغيل يدوي من `main`، وتأكد إن كل الخطوات خضرا والـartifact ظهر.
4. تحقق + فك تشفير + استرجاع على سيرفر تجريبي + `verify-restore.sql`، وسجّل النتيجة والتاريخ.
5. (موصى به) bucket مستقل. وتأكد إن Issues مفعّلة والريبو عليه Watch، وبعد أول فشل أو نجاح اتأكد إن التنبيه اشتغل (issue اتفتح/اتقفل).

## مخاطر متبقية معروفة

* بصمة الـartifact بتثبت إن الملف ما اتغيّرش بعد الـworkflow، **مش** إن الـworkflow نفسه ما اتعدّلش: حماية الفرع والمراجِع (فوق) هي اللي بتغطي ده.
* التحقق من شهادة قاعدة المصدر شغّال في النسخة والمقارنة والفحص ببصمة السيرفر، لكنه **ما اتجرّبش ضد شهادة Render الحقيقية**: لو الشهادة مش من CA عام لازم `BACKUP_DB_SSL_CA` (القسم فوق). اتصال التطبيق ومهام الاستيراد لسه من غير تحقق.
* النسخة المشفّرة بمفتاح واحد (passphrase) مشترك: ضياعه = ضياع النسخ، وتسريبه = قراءة كل النسخ القديمة. دوّره لو اتسرّب، وخزّنه في أكتر من مكان آمن.
* التنبيه بيعتمد على إن الـworkflow يشتغل أصلًا، وعلى إن Issues مفعّلة والإشعارات بتوصلك (القسم فوق). ما اتجرّبش على GitHub.
* الـjob بيفضل بيستخدم secret قاعدة الإنتاج بصلاحية الـrole اللي فيه: role قراءة فقط لسه ما اتعملش.
* الأكشنز (`actions/*`) مش مثبّتة على SHA كامل.
