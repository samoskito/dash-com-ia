import { Inject, Injectable } from "@nestjs/common";
import {
  parseDeploymentConfig,
  type SmtpConfig,
} from "../config/deployment-config";
import { RUNTIME_ENV, type RuntimeEnv } from "../common/runtime/runtime.module";

export type EmailConfigurationHealth =
  | {
      status: "disabled";
      provider: null;
    }
  | {
      status: "ok";
      provider: "smtp";
      relay: {
        host: string;
        port: number;
        security: "starttls" | "tls";
      };
      sender: string;
      replyTo: string;
    };

@Injectable()
export class EmailConfigurationService {
  constructor(
    @Inject(RUNTIME_ENV)
    private readonly env: RuntimeEnv = process.env,
  ) {}

  isEnabled(): boolean {
    return this.config().email.provider === "smtp";
  }

  getWebOrigin(): string {
    return this.config().webOrigin;
  }

  getSmtpConfig(): SmtpConfig {
    const email = this.config().email;

    if (email.provider !== "smtp") {
      throw new Error("Transactional email provider is disabled");
    }

    return email.smtp;
  }

  getEnvelopeSecret(): string {
    return this.getSmtpConfig().password;
  }

  getHealth(): EmailConfigurationHealth {
    const email = this.config().email;

    if (email.provider !== "smtp") {
      return {
        status: "disabled",
        provider: null,
      };
    }

    return {
      status: "ok",
      provider: "smtp",
      relay: {
        host: email.smtp.host,
        port: email.smtp.port,
        security: email.smtp.secure ? "tls" : "starttls",
      },
      sender: email.smtp.fromAddress,
      replyTo: email.smtp.replyTo,
    };
  }

  private config() {
    return parseDeploymentConfig(this.env);
  }
}
