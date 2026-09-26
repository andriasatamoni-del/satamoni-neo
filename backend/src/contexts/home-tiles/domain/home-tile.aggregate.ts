import { HomeTileTitleRequiredError } from "./errors";

export interface HomeTileProps {
  tileKey: string;
  href: string;
  icon: string;
  title: string;
  description: string;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

// HomeTile - نفس مفهوم home_tiles بالريبو القديم بالحرف: بطاقة اختصار تنقل على الصفحة الرئيسية، مش
// مقياس/KPI حي. tileKey/href/icon ثابتين (مرتبطين بصفحة حقيقية في الكود)، مفيش register()/create من
// الـAPI عمدًا - البطاقات بتتزرع من الـmigration بس (نفس تقييد الريبو القديم: إضافة/حذف بطاقة يحتاج
// تغيير كود، مش شاشة إدارة). updateDisplay() هو التعديل المسموح بيه الوحيد وقت التشغيل.
export class HomeTile {
  private constructor(
    public readonly id: string,
    private props: HomeTileProps
  ) {}

  static reconstitute(id: string, props: HomeTileProps): HomeTile {
    return new HomeTile(id, props);
  }

  updateDisplay(input: { title?: string; description?: string; displayOrder?: number }): void {
    if (input.title !== undefined) {
      const title = input.title.trim();
      if (!title) throw new HomeTileTitleRequiredError();
      this.props.title = title;
    }
    if (input.description !== undefined) this.props.description = input.description;
    if (input.displayOrder !== undefined) this.props.displayOrder = input.displayOrder;
    this.props.updatedAt = new Date();
  }

  get tileKey(): string { return this.props.tileKey; }
  get href(): string { return this.props.href; }
  get icon(): string { return this.props.icon; }
  get title(): string { return this.props.title; }
  get description(): string { return this.props.description; }
  get displayOrder(): number { return this.props.displayOrder; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }
}
