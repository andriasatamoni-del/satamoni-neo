import { IsIn, IsOptional, IsString, IsUUID } from "class-validator";
import { CATEGORIES } from "../../../crm/domain/complaint.aggregate";

export class RegisterComplaintFromConversationDto {
  @IsIn(CATEGORIES) category!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsUUID() branchId?: string;
}
