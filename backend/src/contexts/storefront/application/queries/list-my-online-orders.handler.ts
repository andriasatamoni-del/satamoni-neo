import { Inject, Injectable } from "@nestjs/common";
import { STOREFRONT_READER, type StorefrontReaderPort } from "../../domain/ports/storefront-reader.port";
import type { Customer } from "../../../customers/domain/customer.aggregate";

// "طلباتي" للعميل المسجّل - كل طلباته برقم تليفونه (من الموقع أو الكاشير أو الواتساب)، نفس فلسفة
// سجل الطلبات في بوابة العميل بالريبو القديم
@Injectable()
export class ListMyOnlineOrdersHandler {
  constructor(@Inject(STOREFRONT_READER) private readonly reader: StorefrontReaderPort) {}

  async execute(customer: Customer) {
    return this.reader.listOrdersByPhone(customer.phone, 20);
  }
}
