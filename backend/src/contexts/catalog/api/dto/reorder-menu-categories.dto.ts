import { ArrayMaxSize, IsArray, IsString } from "class-validator";

export class ReorderMenuCategoriesDto {
  // معرّفات الأقسام بالترتيب المطلوب + "combos" لمكان تبويب العروض
  @IsArray() @ArrayMaxSize(500) @IsString({ each: true }) order!: string[];
}
