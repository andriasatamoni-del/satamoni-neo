import { Body, Controller, Get, Post, Req, UseFilters, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { RegisterCustomerHandler } from "../application/commands/register-customer.handler";
import { LoginCustomerHandler } from "../application/commands/login-customer.handler";
import { AddCustomerAddressHandler } from "../application/commands/add-customer-address.handler";
import { RegisterCustomerDto } from "./dto/register-customer.dto";
import { LoginCustomerDto } from "./dto/login-customer.dto";
import { AddCustomerAddressDto } from "./dto/add-customer-address.dto";
import { CustomerAuthGuard } from "./guards/customer-auth.guard";
import { CustomersDomainErrorFilter } from "./filters/domain-error.filter";
import type { Customer, CustomerAddress } from "../domain/customer.aggregate";

// بوابة الدخول الذاتي للعملاء (المرحلة 8.38 بالريبو القديم) - رقم تليفون + كلمة سر، منفصلة تمامًا عن
// دخول الموظفين (auth.controller.ts): سر توكن مختلف (راجع CustomersModule)، وguard مختلف
// (CustomerAuthGuard). التسجيل/الدخول اختياريين بالكامل - لا يوجد بعد في neo مسار طلب عام يحتاج حساب
// (راجع تعليق customer.aggregate.ts) - البوابة دي بتغطي الحساب نفسه بس (تسجيل/دخول/بروفايل/عناوين)
@Controller("customer-auth")
@UseFilters(CustomersDomainErrorFilter)
export class CustomerAuthController {
  constructor(
    private readonly registerCustomer: RegisterCustomerHandler,
    private readonly loginCustomer: LoginCustomerHandler,
    private readonly addCustomerAddress: AddCustomerAddressHandler
  ) {}

  @Post("register")
  async register(@Body() dto: RegisterCustomerDto) {
    const { token, customer } = await this.registerCustomer.execute(dto);
    return { token, customer: toPublicCustomer(customer) };
  }

  @Post("login")
  async login(@Body() dto: LoginCustomerDto) {
    const { token, customer } = await this.loginCustomer.execute(dto);
    return { token, customer: toPublicCustomer(customer) };
  }

  @UseGuards(CustomerAuthGuard)
  @Get("me")
  async me(@Req() req: Request & { customer: Customer }) {
    return toPublicCustomer(req.customer);
  }

  @UseGuards(CustomerAuthGuard)
  @Get("me/addresses")
  async myAddresses(@Req() req: Request & { customer: Customer }) {
    return req.customer.addresses.map(toPublicAddress);
  }

  @UseGuards(CustomerAuthGuard)
  @Post("me/addresses")
  async addMyAddress(@Body() dto: AddCustomerAddressDto, @Req() req: Request & { customer: Customer }) {
    const { address } = await this.addCustomerAddress.execute({ customerId: req.customer.id, ...dto });
    return toPublicAddress(address);
  }
}

function toPublicCustomer(customer: Customer) {
  return {
    id: customer.id,
    phone: customer.phone,
    phone2: customer.phone2,
    name: customer.name,
    addressDetails: customer.addressDetails,
    distinguishingMark: customer.distinguishingMark,
    loyaltyPoints: customer.loyaltyPoints,
  };
}

function toPublicAddress(address: CustomerAddress) {
  return {
    id: address.id,
    label: address.label,
    addressDetails: address.addressDetails,
    distinguishingMark: address.distinguishingMark,
    isDefault: address.isDefault,
  };
}
