import { Inject, Injectable } from "@nestjs/common";
import { Customer, normalizePhone } from "../../domain/customer.aggregate";
import { InvalidCustomerCredentialsError } from "../../domain/errors";
import { CUSTOMER_REPOSITORY, type CustomerRepositoryPort } from "../../domain/ports/customer-repository.port";
import { CUSTOMER_PASSWORD_HASHER, type CustomerPasswordHasherPort } from "../../domain/ports/customer-password-hasher.port";
import { CUSTOMER_TOKEN_SERVICE, type CustomerTokenServicePort } from "../../domain/ports/customer-token.service.port";

export interface LoginCustomerCommand {
  phone: string;
  password: string;
}

export interface LoginCustomerResult {
  token: string;
  customer: Customer;
}

@Injectable()
export class LoginCustomerHandler {
  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepositoryPort,
    @Inject(CUSTOMER_PASSWORD_HASHER) private readonly hasher: CustomerPasswordHasherPort,
    @Inject(CUSTOMER_TOKEN_SERVICE) private readonly tokens: CustomerTokenServicePort
  ) {}

  async execute(command: LoginCustomerCommand): Promise<LoginCustomerResult> {
    const phone = normalizePhone(command.phone);
    const customer = await this.customers.findByPhone(phone);
    // نفس رسالة "رقم التليفون أو كلمة السر غلط" الموحّدة بغض النظر عن السبب (رقم مش موجود، عميل ضيف
    // من غير حساب لسه، أو كلمة سر غلط) - عمدًا عشان محدش يقدر يستنتج أرقام مسجّلة
    if (!customer || !customer.passwordHash) throw new InvalidCustomerCredentialsError();

    const valid = await this.hasher.compare(command.password, customer.passwordHash);
    if (!valid) throw new InvalidCustomerCredentialsError();

    const token = this.tokens.sign({ sub: customer.id });
    return { token, customer };
  }
}
