import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseFilters } from "@nestjs/common";
import { GetPublicOrderRatingHandler } from "../application/queries/get-public-order-rating.handler";
import { SubmitOrderRatingHandler } from "../application/commands/submit-order-rating.handler";
import { SubmitOrderRatingDto } from "./dto/submit-order-rating.dto";
import { OrdersDomainErrorFilter } from "./filters/domain-error.filter";

// صفحة تقييم عامة بدون تسجيل دخول - مفيش JwtAuthGuard/PermissionsGuard هنا عمدًا (نفس فلسفة الريبو
// القديم بالظبط: اللينك بتوكن الطلب هو التفويض الوحيد، مفيش حساب مستخدم للعميل خالص)
@Controller("order-ratings")
@UseFilters(OrdersDomainErrorFilter)
export class OrderRatingsController {
  constructor(
    private readonly getPublicOrderRating: GetPublicOrderRatingHandler,
    private readonly submitOrderRating: SubmitOrderRatingHandler
  ) {}

  @Get(":orderId")
  async get(@Param("orderId", ParseUUIDPipe) orderId: string, @Query("token") token?: string) {
    return this.getPublicOrderRating.execute({ orderId, token });
  }

  @Post(":orderId")
  @HttpCode(200)
  async submit(@Param("orderId", ParseUUIDPipe) orderId: string, @Body() dto: SubmitOrderRatingDto) {
    await this.submitOrderRating.execute({ orderId, token: dto.token, stars: dto.stars, comment: dto.comment });
    return { ok: true };
  }
}
