import { IsBoolean, IsDateString, IsIn, IsOptional, IsString } from "class-validator";
import { EMPLOYEE_STATUSES } from "../../domain/employee.aggregate";

export class SetEmployeeStatusDto {
  @IsIn(EMPLOYEE_STATUSES)
  status!: string;

  @IsOptional() @IsDateString() terminationDate?: string;
  @IsOptional() @IsString() terminationReason?: string;
  @IsOptional() @IsString() reason?: string;
  // لو فيه بنود معلّقة (شيفت شغال/راتب معتمد) وقت إنهاء الخدمة، الطلب بيترفض أول مرة (409 + قائمة
  // البنود) - لازم يتبعت تاني مع acknowledgeBlockers:true عشان ينفّذ رغم وجودها
  @IsOptional() @IsBoolean() acknowledgeBlockers?: boolean;
}
