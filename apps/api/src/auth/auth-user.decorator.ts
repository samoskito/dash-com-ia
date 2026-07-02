import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import { extractAuthToken } from "./auth-token";

export const AuthToken = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest();
    return extractAuthToken(request);
  }
);
