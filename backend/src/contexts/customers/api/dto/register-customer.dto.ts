import { Type } from "class-transformer";
import { IsString, MaxLength, ValidateNested } from "class-validator";
import { AddressInputDto } from "./address-input.dto";

// تسجيل مرة واحدة: كل بيانات التواصل + أول عنوان توصيل، وبعد كده العميل بيطلب من غير ما يكتب حاجة تاني
export class RegisterCustomerDto {
  @IsString() @MaxLength(20) phone!: string;
  @IsString() @MaxLength(20) phone2!: string;
  @IsString() @MaxLength(120) email!: string;
  @IsString() @MaxLength(80) name!: string;
  @IsString() @MaxLength(100) password!: string;

  @ValidateNested()
  @Type(() => AddressInputDto)
  address!: AddressInputDto;
}
