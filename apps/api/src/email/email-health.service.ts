import { Injectable } from "@nestjs/common";
import {
  EmailConfigurationService,
  type EmailConfigurationHealth,
} from "./email-configuration.service";

@Injectable()
export class EmailHealthService {
  constructor(private readonly configuration: EmailConfigurationService) {}

  getConfigurationHealth(): EmailConfigurationHealth {
    return this.configuration.getHealth();
  }
}
