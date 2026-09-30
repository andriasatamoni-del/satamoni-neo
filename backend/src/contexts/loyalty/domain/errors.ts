import { DomainError } from "../../../shared/domain/domain-error";

export { DomainError };

export class InvalidLoyaltyRewardError extends DomainError {}

export class LoyaltyRewardNotFoundError extends DomainError {
  constructor() {
    super("المكافأة دي مش موجودة أو مش متاحة دلوقتي");
  }
}

export class InsufficientLoyaltyPointsError extends DomainError {
  constructor(needed: number, balance: number) {
    super(`نقاطك مش كفاية - المكافأة محتاجة ${needed} نقطة ورصيدك ${balance}`);
  }
}
