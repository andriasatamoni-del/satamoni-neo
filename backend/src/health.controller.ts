import { Controller, Get } from "@nestjs/common";

// نقطة فحص بسيطة لمزوّد الاستضافة (health check) - بلا مصادقة عمدًا، بترجع 200 لو الـprocess شغّال
// (مش بتتأكد من الاتصال بقاعدة البيانات - نفس فلسفة "liveness" مش "readiness")
@Controller("health")
export class HealthController {
  @Get()
  check() {
    return { status: "ok" };
  }
}
