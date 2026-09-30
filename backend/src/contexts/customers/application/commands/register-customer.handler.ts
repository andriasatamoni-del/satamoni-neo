import { Inject, Injectable } from "@nestjs/common";
import { Customer, normalizeEmail, normalizePhone, type StructuredAddressInput } from "../../domain/customer.aggregate";
import { CustomerAccountAlreadyExistsError, EmailAlreadyUsedError } from "../../domain/errors";
import { CUSTOMER_REPOSITORY, type CustomerRepositoryPort } from "../../domain/ports/customer-repository.port";
import { CUSTOMER_PASSWORD_HASHER, type CustomerPasswordHasherPort } from "../../domain/ports/customer-password-hasher.port";
import { CUSTOMER_TOKEN_SERVICE, type CustomerTokenServicePort } from "../../domain/ports/customer-token.service.port";

export interface RegisterCustomerCommand {
  phone: string;
  phone2: string;
  email: string;
  name: string;
  password: string;
  address: StructuredAddressInput;
}

export interface RegisterCustomerResult {
  token: string;
  customer: Customer;
}

// تسجيل حساب عميل جديد (STORE-2): الاسم + التليفونين + الإيميل + أول عنوان، كلهم إلزاميين. لو الرقم ده
// موجود قبل كده كعميل ضيف (من غير حساب)، بيتحول لحساب حقيقي وبياناته القديمة (نقاط الولاء، عناوينه)
// بتفضل زي ما هي - نفس فلسفة الريبو القديم (راجع تعليق activateAccount بالـaggregate)
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

    const existing = await this.customers.findByPhone(phone);
    if (existing?.hasAccount) throw new CustomerAccountAlreadyExistsError();
    const emailOwner = await this.customers.findByEmail(normalizeEmail(command.email));
    if (emailOwner && emailOwner.id !== existing?.id) throw new EmailAlreadyUsedError();

    const passwordHash = await this.hasher.hash(command.password);
    const contact = { name: command.name, email: command.email, phone2: command.phone2, passwordHash };
    let customer: Customer;
    if (existing) {
      existing.activateAccount(contact);
      customer = existing;
    } else {
      customer = Customer.register({ phone, ...contact });
    }
    customer.addAddress({ ...command.address, isDefault: true });

    await this.customers.save(customer);
    const token = this.tokens.sign({ sub: customer.id });
    return { token, customer };
  }
}
