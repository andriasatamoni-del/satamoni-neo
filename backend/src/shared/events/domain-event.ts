// كل حدث دومين في النظام بيرث من الكلاس ده - اسم الحدث + وقت حدوثه + الحمولة (payload) بتاعته.
// نفس فلسفة audit_logs في الريبو القديم (اسم إجراء + وقت + بيانات) بس هنا الهدف تواصل بين الـcontexts
// مش تسجيل تدقيق بس (audit trail ممكن يبقى subscriber زي أي subscriber تاني على نفس الحدث).
export abstract class DomainEvent {
  abstract readonly eventName: string;
  readonly occurredAt: Date = new Date();
}
