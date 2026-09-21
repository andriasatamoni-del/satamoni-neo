import type { PrintJob } from "../print-job.aggregate";

export interface PrintJobRepositoryPort {
  // upsert على idempotency_key - INSERT ... ON CONFLICT DO NOTHING RETURNING بالظبط زي الريبو القديم:
  // لو الصف موجود بالفعل (نفس المفتاح)، بيرجّع الصف الموجود من غير ما يعمل حاجة (مش بيحدّثه) - نفس
  // فلسفة "أي إعادة إنشاء لنفس الحدث بترجع نفس الصف" في كل idempotency_key تاني في المشروع
  queue(job: PrintJob): Promise<PrintJob>;
  findById(id: string): Promise<PrintJob | null>;
  list(filter: { branchId: string; status?: string; orderId?: string; limit?: number }): Promise<PrintJob[]>;

  // الأربعة دول كل واحدة UPDATE ذرّي بشرط الحالة الحالية (WHERE status = 'X') على مستوى الداتابيز نفسها
  // - مش "حمّل الأجريجيت، عدّله، احفظه" عادي - نفس فلسفة "قفل الصف" في كل route تاني في المشروع (orders/
  // shifts/deliveries): لو أكتر من وكيل طباعة حاولوا ياخدوا نفس الـjob في نفس اللحظة بالظبط، الشرط ده
  // هو اللي بيضمن واحد بس ينجح فعليًا. بترجع null لو الحالة الحالية مش اللي متوقعة (already claimed/
  // already printed/...) - الـhandler بيترجم null لخطأ الدومين المناسب
  claim(id: string): Promise<PrintJob | null>;
  markPrinted(id: string): Promise<PrintJob | null>;
  markFailed(id: string, error: string | null): Promise<PrintJob | null>;
  retry(id: string): Promise<PrintJob | null>;
}

export const PRINT_JOB_REPOSITORY = Symbol("PRINT_JOB_REPOSITORY");
