import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { CUSTOMER_TOKEN_SERVICE, type CustomerTokenServicePort } from "../../domain/ports/customer-token.service.port";
import { CUSTOMER_REPOSITORY, type CustomerRepositoryPort } from "../../domain/ports/customer-repository.port";
import type { Customer } from "../../domain/customer.aggregate";

// نفس فلسفة JwtAuthGuard بتاع الموظفين بالحرف، بس بسر توكن منفصل تمامًا (راجع CustomersModule) عشان
// توكن عميل ميتحققش أبدًا بمكتبة التحقق بتاعة الموظفين ولا العكس، حتى لو بالصدفة عندهم نفس sub
@Injectable()
export class CustomerAuthGuard implements CanActivate {
  constructor(
    @Inject(CUSTOMER_TOKEN_SERVICE) private readonly tokens: CustomerTokenServicePort,
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepositoryPort
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { customer?: Customer }>();
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw new UnauthorizedException("لازم تسجل دخول");

    let payload;
    try {
      payload = this.tokens.verify(header.slice("Bearer ".length));
    } catch {
      throw new UnauthorizedException("التوكن غير صالح أو منتهي، سجل دخول تاني");
    }

    const customer = await this.customers.findById(payload.sub);
    if (!customer || !customer.hasAccount) throw new UnauthorizedException("الحساب ده مش موجود، سجل دخول تاني");

    req.customer = customer;
    return true;
  }
}
