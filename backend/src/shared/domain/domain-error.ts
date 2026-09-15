// أساس مشترك لكل أخطاء الدومين في أي context - الدومين نفسه مايعرفش حاجة عن HTTP، ده بس اسم +
// رسالة، وطبقة الـAPI بتاعت كل context هي اللي بتقرر status code المناسب (راجع DomainErrorFilter)
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
