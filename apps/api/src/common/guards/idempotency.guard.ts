import {
  CanActivate,
  ConflictException,
  ExecutionContext,
  Injectable,
} from "@nestjs/common";

const MAX_IDEMPOTENCY_KEY_LENGTH = 128;

@Injectable()
export class IdempotencyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const header = request.headers["idempotency-key"];
    const idempotencyKey = Array.isArray(header) ? header[0] : header;

    if (
      typeof idempotencyKey !== "string" ||
      idempotencyKey.trim().length === 0 ||
      idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH
    ) {
      throw new ConflictException("Header Idempotency-Key é obrigatório");
    }

    request.idempotencyKey = idempotencyKey;
    return true;
  }
}
