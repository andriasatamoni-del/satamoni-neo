import { DomainError } from "../../../shared/domain/domain-error";

export { DomainError };

export class MenuCategoryNameRequiredError extends DomainError {
  constructor() {
    super("اسم القسم مطلوب");
  }
}

export class MenuCategoryNotFoundError extends DomainError {
  constructor() {
    super("القسم ده مش موجود");
  }
}

export class MenuItemNameRequiredError extends DomainError {
  constructor() {
    super("اسم الصنف مطلوب");
  }
}

export class DuplicateVariantLabelError extends DomainError {
  constructor(label: string) {
    super(`في حجم بنفس الاسم ده بالفعل في الصنف: ${label}`);
  }
}

export class VariantNotFoundError extends DomainError {
  constructor() {
    super("الحجم ده مش موجود في الصنف");
  }
}

export class MenuItemNotFoundError extends DomainError {
  constructor() {
    super("الصنف ده مش موجود");
  }
}

export class UnknownRecipeTypeError extends DomainError {
  constructor(value: string) {
    super(`نوع الوصفة ده مش معروف: ${value}`);
  }
}

export class RecipeAssociationRequiredError extends DomainError {
  constructor() {
    super("لازم تحدد الحجم أو الصنف المصنّع المرتبط بالوصفة (واحد بس)");
  }
}

export class RecipeNotFoundError extends DomainError {
  constructor() {
    super("الوصفة دي مش موجودة");
  }
}

export class RecipeVersionNotFoundError extends DomainError {
  constructor() {
    super("نسخة الوصفة دي مش موجودة");
  }
}

export class RecipeVersionNotEditableError extends DomainError {
  constructor() {
    super("نسخة الوصفة دي مش DRAFT، مينفعش تتعدّل - اعمل نسخة جديدة بدل ما تعدّل دي");
  }
}

export class EmptyRecipeIngredientsError extends DomainError {
  constructor() {
    super("لازم الوصفة يكون فيها مكوّن واحد على الأقل قبل ما تتفعّل");
  }
}
