import { randomUUID } from "node:crypto";
import { InvalidRatingStarsError } from "./errors";

export interface OrderRatingProps {
  orderId: string;
  branchId: string | null;
  stars: number;
  comment: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// OrderRating - نفس مفهوم order_ratings في الريبو القديم: تقييم واحد بس لكل طلب (upsert في
// الـrepository عند order_id مكرر، راجع kysely-order-rating.repository.ts) - إعادة الإرسال بنفس
// اللينك بتحدّث نفس الصف مش تنشئ واحد جديد. مفيش أجريجيت مستقل ليه دورة حياة معقدة - مجرد سطر واحد
// (stars 1-5 + تعليق اختياري) مرتبط بطلب واحد، فالقاعدة الوحيدة الحقيقية هنا هي نطاق النجوم.
export class OrderRating {
  private constructor(
    public readonly id: string,
    private props: OrderRatingProps
  ) {}

  static submit(input: { orderId: string; branchId: string | null; stars: number; comment?: string | null }): OrderRating {
    if (!Number.isInteger(input.stars) || input.stars < 1 || input.stars > 5) {
      throw new InvalidRatingStarsError();
    }
    const now = new Date();
    return new OrderRating(randomUUID(), {
      orderId: input.orderId,
      branchId: input.branchId,
      stars: input.stars,
      comment: input.comment?.trim() || null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(id: string, props: OrderRatingProps): OrderRating {
    return new OrderRating(id, props);
  }

  get orderId(): string { return this.props.orderId; }
  get branchId(): string | null { return this.props.branchId; }
  get stars(): number { return this.props.stars; }
  get comment(): string | null { return this.props.comment; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }
}
