import { DomainEvent } from "../../../../shared/events/domain-event";

export class UserRegisteredEvent extends DomainEvent {
  readonly eventName = "identity-access.user-registered";
  constructor(
    readonly userId: string,
    readonly email: string,
    readonly role: string
  ) {
    super();
  }
}
