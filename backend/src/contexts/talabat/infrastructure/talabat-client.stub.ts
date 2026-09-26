import { Injectable } from "@nestjs/common";
import { TalabatNotImplementedError } from "../domain/errors";

// STUB - نفس فلسفة talabat-client.js بالريبو القديم بالحرف. كل دالة بترمي TalabatNotImplementedError
// واضحة لحد ما مواصفة Talabat Partner API الحقيقية تتوفر (OAuth flow، شكل GET order details/history
// الحقيقي) - راجع docs/TALABAT-INTEGRATION.md قسم 8. عمدًا مبنيش على تخمين لشكل الحقول.
@Injectable()
export class TalabatClientStub {
  async getAccessToken(): Promise<never> {
    throw new TalabatNotImplementedError("getAccessToken");
  }

  async getOrderDetails(_talabatOrderId: string): Promise<never> {
    throw new TalabatNotImplementedError("getOrderDetails");
  }

  async getOrderHistory(_branchId: string, _from: Date, _to: Date): Promise<never> {
    throw new TalabatNotImplementedError("getOrderHistory");
  }
}
