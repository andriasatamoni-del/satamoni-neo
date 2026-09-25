import { Inject, Injectable } from "@nestjs/common";
import { Customer, normalizePhone } from "../../domain/customer.aggregate";
import { CustomerAccountAlreadyExistsError } from "../../domain/errors";
import { CUSTOMER_REPOSITORY, type CustomerRepositoryPort } from "../../domain/ports/customer-repository.port";
import { CUSTOMER_PASSWORD_HASHER, type CustomerPasswordHasherPort } from "../../domain/ports/customer-password-hasher.port";
import { CUSTOMER_TOKEN_SERVICE, type CustomerTokenServicePort } from "../../domain/ports/customer-token.service.port";

export interface RegisterCustomerCommand {
  phone: string;
  name: string;
  password: string;
}

export interface RegisterCustomerResult {
  token: string;
  customer: Customer;
}

// تسجيل حساب عميل جديد - لو الرقم ده موجود قبل كده من طلب ضيف سابق (مفيش عليه حساب لسه)، بيتحول لحساب
// حقيقي وبياناته القديمة (نقاط الولاء، العنوان المحفوظ) بتفضل زي ما هي - نفس فلسفة الريبو القديم بالحرف
// (راجع تعليق activateAccount بالـaggregate)
@Injectable()
export class RegisterCustomerHandler {
  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepositoryPort,
    @Inject(CUSTOMER_PASSWORD_HASHER) private readonly hasher: CustomerPasswordHasherPort,
    @Inject(CUSTOMER_TOKEN_SERVICE) private readonly tokens: CustomerTokenServicePort
  ) {}

  async execute(command: RegisterCustomerCommand): Promise<RegisterCustomerResult> {
    Customer.validatePasswordPolicy(command.password);
    const phone = normalizePhone(command.phone);
    const passwordHash = await this.hasher.hash(command.password);

    const existing = await this.customers.findByPhone(phone);
    let customer: Customer;
    if (existing) {
      if (existing.hasAccount) throw new CustomerAccountAlreadyExistsError();
      existing.activateAccount({ name: command.name, passwordHash });
      customer = existing;
    } else {
      customer = Customer.register({ phone, name: command.name, passwordHash });
    }

    await this.customers.save(customer);
    const token = this.tokens.sign({ sub: customer.id });
    return { token, customer };
  }
}
