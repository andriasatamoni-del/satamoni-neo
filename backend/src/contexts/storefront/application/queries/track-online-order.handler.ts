import { Inject, Injectable } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { STOREFRONT_READER, type StorefrontReaderPort, type TrackedOrder } from "../../domain/ports/storefront-reader.port";
import { OnlineOrderNotFoundError } from "../../domain/errors";

function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// تتبّع الطلب بدون تسجيل دخول - التوكن العشوائي بتاع الطلب (نفس توكن رابط التقييم) هو التفويض الوحيد.
// توكن غلط = نفس رد "مش موجود" بالظبط، عشان محدش يعرف إن رقم الطلب صح من غير التوكن
@Injectable()
export class TrackOnlineOrderHandler {
  constructor(@Inject(STOREFRONT_READER) private readonly reader: StorefrontReaderPort) {}

  async execute(query: { orderId: string; token?: string }): Promise<TrackedOrder> {
    const order = await this.reader.findOrder(query.orderId);
    if (!order || !query.token || !sameToken(order.trackingToken, query.token)) throw new OnlineOrderNotFoundError();
    return order;
  }
}
