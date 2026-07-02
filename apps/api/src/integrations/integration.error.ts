import type { IntegrationProvider } from "./integration.types";

export class IntegrationError extends Error {
  constructor(
    message: string,
    readonly provider: IntegrationProvider,
    readonly causeCode: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "IntegrationError";
  }
}
