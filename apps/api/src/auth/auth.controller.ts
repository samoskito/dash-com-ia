import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException
} from "@nestjs/common";
import {
  googleOAuthStartSchema,
  loginSchema,
  registerSchema
} from "@wpptrack/shared";
import { extractAuthToken, firstHeader } from "./auth-token";
import { AuthService, type AuthSessionResult } from "./auth.service";

const sessionCookieName = "wpptrack_session";

type HeaderValue = string | string[] | undefined;

type AuthRequest = {
  headers: Record<string, HeaderValue>;
  ip?: string;
};

type CookieResponse = {
  cookie: (
    name: string,
    value: string,
    options: {
      httpOnly: boolean;
      sameSite: "lax";
      secure: boolean;
      expires: Date;
      path: string;
    }
  ) => void;
  clearCookie: (name: string, options: { path: string }) => void;
};

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post("register")
  async register(
    @Body() body: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: CookieResponse
  ): Promise<AuthSessionResult> {
    const input = this.parseBody(registerSchema.safeParse(body));
    const session = await this.authService.register(input, {
      userAgent: firstHeader(request.headers["user-agent"]) ?? null,
      ipAddress: request.ip ?? null
    });

    this.setSessionCookie(response, session);

    return session;
  }

  @Post("login")
  @HttpCode(200)
  async login(
    @Body() body: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: CookieResponse
  ): Promise<AuthSessionResult> {
    const input = this.parseBody(loginSchema.safeParse(body));
    const session = await this.authService.login(input, {
      userAgent: firstHeader(request.headers["user-agent"]) ?? null,
      ipAddress: request.ip ?? null
    });

    this.setSessionCookie(response, session);

    return session;
  }

  @Get("me")
  async me(@Req() request: AuthRequest) {
    return this.authService.getSession(extractAuthToken(request));
  }

  @Post("logout")
  @HttpCode(200)
  async logout(
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: CookieResponse
  ) {
    await this.authService.logout(extractAuthToken(request));
    response.clearCookie(sessionCookieName, { path: "/" });

    return { ok: true };
  }

  @Post("google/start")
  startGoogleOAuth(@Body() body: unknown) {
    const input = this.parseBody(googleOAuthStartSchema.safeParse(body));

    return this.authService.getGoogleOAuthStart(input);
  }

  private parseBody<T>(result: { success: true; data: T } | { success: false }): T {
    if (!result.success) {
      throw new BadRequestException("Payload invalido");
    }

    return result.data;
  }

  private setSessionCookie(
    response: CookieResponse,
    session: AuthSessionResult
  ): void {
    response.cookie(sessionCookieName, session.refreshToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      expires: session.expiresAt,
      path: "/"
    });
  }

}
