import { randomBytes, createHash } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Optional,
  UnauthorizedException
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type {
  EmailVerificationConfirmDto,
  EmailVerificationConfirmInputDto,
  EmailVerificationStartDto,
  GoogleOAuthCallbackQueryDto,
  GoogleOAuthCallbackResultDto,
  GoogleOAuthStartDto,
  GoogleOAuthStartResultDto,
  LoginDto,
  PasswordResetConfirmDto,
  PasswordResetConfirmInputDto,
  PasswordResetRequestDto,
  PasswordResetRequestInputDto,
  RegisterDto
} from "@wpptrack/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import {
  RUNTIME_ENV,
  RUNTIME_FETCH,
  type RuntimeEnv,
  type RuntimeFetch
} from "../common/runtime/runtime.module";
import { PasswordService } from "./password.service";
import type { AuthenticatedUser } from "./session.types";

const refreshTokenBytes = 32;
const sessionTtlMs = 1000 * 60 * 60 * 24 * 30;
const passwordResetTtlMs = 1000 * 60 * 30;
const emailVerificationTtlMs = 1000 * 60 * 60 * 24;
const loginFailureWindowMs = 1000 * 60 * 15;
const loginFailureLimit = 5;
const passwordResetRequestWindowMs = 1000 * 60 * 15;
const passwordResetRequestLimit = 3;

type WorkspaceMembershipRecord = {
  role: AuthenticatedUser["workspaces"][number]["role"];
  workspace: {
    id: string;
    name: string;
    slug: string;
  };
};

type EmailLoginUserRecord = {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string | null;
  authProvider?: string;
  googleId?: string | null;
  emailVerifiedAt?: Date | null;
  memberships: WorkspaceMembershipRecord[];
};

type SessionUserRecord = EmailLoginUserRecord;

type AuthSessionRecord = {
  id?: string;
  userId?: string;
  revokedAt: Date | null;
  expiresAt: Date;
  user: SessionUserRecord;
};

type AuthRequestContext = {
  userAgent?: string | null;
  ipAddress?: string | null;
};
type AuthActionTokenType = "password_reset" | "email_verification";
type AuthActionTokenRecord = {
  id: string;
  userId: string;
  type: AuthActionTokenType;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
};

type GoogleTokenResponse = {
  access_token?: unknown;
  token_type?: unknown;
  expires_in?: unknown;
  error?: unknown;
  error_description?: unknown;
};

type GoogleUserInfoResponse = {
  sub?: unknown;
  email?: unknown;
  email_verified?: unknown;
  name?: unknown;
};

type GoogleOAuthCallbackNonAuthenticatedResult = GoogleOAuthCallbackResultDto & {
  action: "configure_env" | "exchange_pending" | "exchange_failed";
};

type GoogleOAuthCallbackServiceResult =
  | GoogleOAuthCallbackNonAuthenticatedResult
  | (GoogleOAuthCallbackResultDto & {
      action: "authenticated";
      session: AuthSessionResult;
    });

export type AuthSessionResult = AuthenticatedUser & {
  refreshToken: string;
  expiresAt: Date;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    @Optional()
    @Inject(RUNTIME_ENV)
    private readonly env: RuntimeEnv = process.env,
    @Optional()
    @Inject(RUNTIME_FETCH)
    private readonly fetchImpl: RuntimeFetch = fetch
  ) {}

  async register(
    input: RegisterDto,
    context: AuthRequestContext = {}
  ): Promise<AuthSessionResult> {
    const email = this.normalizeEmail(input.email);
    const existingUser = await this.prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      throw new ConflictException("Email ja cadastrado");
    }

    const passwordHash = await this.passwordService.hash(input.password);
    const name = input.name.trim();
    const workspaceName = input.workspaceName.trim();

    const userId = await this.prisma.$transaction(async (tx) => {
      const slug = await this.resolveWorkspaceSlug(workspaceName, tx);
      const workspace = await tx.workspace.create({
        data: {
          name: workspaceName,
          slug
        }
      });
      const user = await tx.user.create({
        data: {
          email,
          name,
          passwordHash
        }
      });

      await tx.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: user.id,
          role: "owner"
        }
      });

      return user.id;
    });

    return this.createSessionForUser(userId, context);
  }

  async login(
    input: LoginDto,
    context: AuthRequestContext = {}
  ): Promise<AuthSessionResult> {
    const email = this.normalizeEmail(input.email);

    await this.assertLoginNotRateLimited(email, context);

    let authenticated: AuthenticatedUser;

    try {
      authenticated = await this.validateEmailLogin(input);
    } catch (error) {
      await this.recordLoginFailure(email, context);
      throw error;
    }

    const session = await this.createSessionForUser(
      authenticated.user.id,
      context
    );
    await this.recordLoginSuccess(session, context);

    return session;
  }

  async getSession(refreshToken: string): Promise<AuthenticatedUser> {
    const refreshHash = this.hashRefreshToken(refreshToken);
    const session = (await this.prisma.authSession.findUnique({
      where: { refreshHash },
      include: {
        user: {
          include: {
            memberships: {
              include: {
                workspace: true
              }
            }
          }
        }
      }
    })) as AuthSessionRecord | null;

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() <= Date.now()
    ) {
      throw this.invalidCredentials();
    }

    return this.toAuthenticatedUser(session.user);
  }

  async logout(refreshToken: string): Promise<void> {
    const refreshHash = this.hashRefreshToken(refreshToken);
    const session = (await this.prisma.authSession.findUnique({
      where: { refreshHash },
      include: {
        user: {
          include: {
            memberships: {
              include: {
                workspace: true
              }
            }
          }
        }
      }
    })) as AuthSessionRecord | null;

    await this.prisma.authSession.updateMany({
      where: {
        refreshHash,
        revokedAt: null
      },
      data: {
        revokedAt: new Date()
      }
    });

    if (session && !session.revokedAt) {
      await this.safeCreateAuditLog({
        workspaceId: session.user.memberships[0]?.workspace.id ?? null,
        actorUserId: session.user.id,
        actorType: "user",
        action: "auth.logout",
        targetType: "AuthSession",
        targetId: session.id ?? refreshHash,
        reason: null,
        sourceIp: null,
        resultStatus: "success",
        beforeSummary: null,
        afterSummary: {
          userId: session.user.id
        }
      });
    }
  }

  getGoogleOAuthStart(
    input: GoogleOAuthStartDto
  ): GoogleOAuthStartResultDto {
    const clientId = this.env.GOOGLE_CLIENT_ID;
    const redirectUri = this.env.GOOGLE_REDIRECT_URI;
    const requiredEnv: Array<[string, string | undefined]> = [
      ["GOOGLE_CLIENT_ID", clientId],
      ["GOOGLE_REDIRECT_URI", redirectUri]
    ];
    const missingEnv = requiredEnv
      .filter(([, value]) => !value)
      .map(([key]) => key);

    if (missingEnv.length > 0) {
      return {
        provider: "google",
        action: "configure_env",
        authorizationUrl: null,
        missingEnv,
        state: null
      };
    }

    const state = this.createOAuthState(input.redirectTo);
    const params = new URLSearchParams({
      client_id: clientId!,
      redirect_uri: redirectUri!,
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      prompt: "select_account",
      state
    });

    return {
      provider: "google",
      action: "redirect",
      authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      missingEnv: [],
      state
    };
  }

  async handleGoogleOAuthCallback(
    input: GoogleOAuthCallbackQueryDto,
    context: AuthRequestContext = {}
  ): Promise<GoogleOAuthCallbackServiceResult> {
    const requiredEnv: Array<[string, string | undefined]> = [
      ["GOOGLE_CLIENT_ID", this.env.GOOGLE_CLIENT_ID],
      ["GOOGLE_CLIENT_SECRET", this.env.GOOGLE_CLIENT_SECRET],
      ["GOOGLE_REDIRECT_URI", this.env.GOOGLE_REDIRECT_URI]
    ];
    const missingEnv = requiredEnv
      .filter(([, value]) => !value)
      .map(([key]) => key);
    const redirectTo = this.readOAuthRedirect(input.state);

    if (missingEnv.length > 0) {
      return {
        provider: "google",
        action: "configure_env",
        missingEnv,
        codeReceived: true,
        redirectTo
      };
    }

    const token = await this.exchangeGoogleCode(input.code);

    if (!token.accessToken) {
      return {
        provider: "google",
        action: "exchange_failed",
        missingEnv: [],
        codeReceived: true,
        redirectTo,
        message: token.message
      };
    }

    const profile = await this.getGoogleUserInfo(token.accessToken);

    if (!profile.googleId || !profile.email) {
      return {
        provider: "google",
        action: "exchange_failed",
        missingEnv: [],
        codeReceived: true,
        redirectTo,
        message: profile.message
      };
    }

    const session = await this.authenticateGoogleProfile(
      {
        googleId: profile.googleId,
        email: profile.email,
        emailVerified: profile.emailVerified,
        name: profile.name
      },
      context
    );

    return {
      provider: "google",
      action: "authenticated",
      missingEnv: [],
      codeReceived: true,
      redirectTo,
      session
    };
  }

  async requestPasswordReset(
    input: PasswordResetRequestInputDto,
    context: AuthRequestContext = {}
  ): Promise<PasswordResetRequestDto> {
    const email = this.normalizeEmail(input.email);
    const user = await this.prisma.user.findUnique({
      where: { email }
    });
    const rateLimited = await this.isPasswordResetRequestRateLimited(
      email,
      context
    );

    if (rateLimited) {
      await this.recordPasswordResetRequest(
        email,
        user?.id ?? null,
        context,
        "rate_limited"
      );

      return {
        ok: true,
        delivery: this.getTokenDelivery(),
        devToken: null
      };
    }

    await this.recordPasswordResetRequest(
      email,
      user?.id ?? null,
      context,
      "queued"
    );

    if (!user) {
      return {
        ok: true,
        delivery: this.getTokenDelivery(),
        devToken: null
      };
    }

    return this.createActionToken(
      user.id,
      "password_reset",
      passwordResetTtlMs
    );
  }

  async resetPassword(
    input: PasswordResetConfirmInputDto
  ): Promise<PasswordResetConfirmDto> {
    const userId = await this.consumeActionToken("password_reset", input.token);
    const passwordHash = await this.passwordService.hash(input.password);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash }
    });
    const revokedSessions = await this.prisma.authSession.updateMany({
      where: {
        userId,
        revokedAt: null
      },
      data: {
        revokedAt: new Date()
      }
    });
    await this.safeCreateAuditLog({
      workspaceId: null,
      actorUserId: userId,
      actorType: "user",
      action: "auth.password_reset_confirmed",
      targetType: "User",
      targetId: userId,
      reason: null,
      sourceIp: null,
      resultStatus: "success",
      beforeSummary: null,
      afterSummary: {
        revokedSessions: revokedSessions.count
      }
    });

    return { ok: true };
  }

  async requestEmailVerification(
    refreshToken: string
  ): Promise<EmailVerificationStartDto> {
    const authenticated = await this.getSession(refreshToken);
    return this.requestEmailVerificationForUser(authenticated.user.id);
  }

  async requestEmailVerificationForUser(
    userId: string
  ): Promise<EmailVerificationStartDto> {
    await this.assertUserExists(userId);
    return this.createActionToken(
      userId,
      "email_verification",
      emailVerificationTtlMs
    );
  }

  async confirmEmailVerification(
    input: EmailVerificationConfirmInputDto
  ): Promise<EmailVerificationConfirmDto> {
    const userId = await this.consumeActionToken(
      "email_verification",
      input.token
    );
    const emailVerifiedAt = new Date();

    await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt }
    });

    return {
      ok: true,
      emailVerifiedAt: emailVerifiedAt.toISOString()
    };
  }

  async validateEmailLogin(input: LoginDto): Promise<AuthenticatedUser> {
    const email = this.normalizeEmail(input.email);
    const user = (await this.prisma.user.findUnique({
      where: { email },
      include: {
        memberships: {
          include: {
            workspace: true
          }
        }
      }
    })) as EmailLoginUserRecord | null;

    if (!user?.passwordHash) {
      throw this.invalidCredentials();
    }

    const validPassword = await this.passwordService.verify(
      input.password,
      user.passwordHash
    );

    if (!validPassword) {
      throw this.invalidCredentials();
    }

    return this.toAuthenticatedUser(user);
  }

  private async createSessionForUser(
    userId: string,
    context: AuthRequestContext
  ): Promise<AuthSessionResult> {
    const user = (await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          include: {
            workspace: true
          }
        }
      }
    })) as EmailLoginUserRecord | null;

    if (!user) {
      throw this.invalidCredentials();
    }

    const refreshToken = randomBytes(refreshTokenBytes).toString("hex");
    const expiresAt = new Date(Date.now() + sessionTtlMs);

    await this.prisma.authSession.create({
      data: {
        userId: user.id,
        refreshHash: this.hashRefreshToken(refreshToken),
        userAgent: context.userAgent ?? null,
        ipAddress: context.ipAddress ?? null,
        expiresAt
      }
    });

    return {
      ...this.toAuthenticatedUser(user),
      refreshToken,
      expiresAt
    };
  }

  private async exchangeGoogleCode(
    code: string
  ): Promise<{ accessToken: string | null; message?: string }> {
    const body = new URLSearchParams({
      code,
      client_id: this.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: this.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: this.env.GOOGLE_REDIRECT_URI ?? "",
      grant_type: "authorization_code"
    });

    try {
      const response = await this.fetchImpl("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body
      });
      const payload = (await response.json().catch(() => ({}))) as GoogleTokenResponse;

      if (!response.ok || !this.asString(payload.access_token)) {
        return {
          accessToken: null,
          message:
            this.asString(payload.error_description) ??
            this.asString(payload.error) ??
            `Google OAuth HTTP ${response.status}`
        };
      }

      return {
        accessToken: this.asString(payload.access_token)
      };
    } catch (error) {
      return {
        accessToken: null,
        message:
          error instanceof Error ? error.message : "Erro ao trocar code Google"
      };
    }
  }

  private async getGoogleUserInfo(accessToken: string): Promise<{
    googleId: string | null;
    email: string | null;
    emailVerified: boolean;
    name: string | null;
    message?: string;
  }> {
    try {
      const response = await this.fetchImpl(
        "https://openidconnect.googleapis.com/v1/userinfo",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        }
      );
      const payload = (await response.json().catch(() => ({}))) as GoogleUserInfoResponse;

      if (!response.ok) {
        return {
          googleId: null,
          email: null,
          emailVerified: false,
          name: null,
          message: `Google userinfo HTTP ${response.status}`
        };
      }

      return {
        googleId: this.asString(payload.sub),
        email: this.asString(payload.email)
          ? this.normalizeEmail(this.asString(payload.email)!)
          : null,
        emailVerified: payload.email_verified === true,
        name: this.asString(payload.name),
        message: undefined
      };
    } catch (error) {
      return {
        googleId: null,
        email: null,
        emailVerified: false,
        name: null,
        message:
          error instanceof Error ? error.message : "Erro ao buscar perfil Google"
      };
    }
  }

  private async authenticateGoogleProfile(
    profile: {
      googleId: string;
      email: string;
      emailVerified: boolean;
      name: string | null;
    },
    context: AuthRequestContext
  ): Promise<AuthSessionResult> {
    const existingByGoogle = (await this.prisma.user.findUnique({
      where: { googleId: profile.googleId },
      include: {
        memberships: {
          include: {
            workspace: true
          }
        }
      }
    })) as EmailLoginUserRecord | null;

    if (existingByGoogle) {
      return this.createSessionForUser(existingByGoogle.id, context);
    }

    const existingByEmail = (await this.prisma.user.findUnique({
      where: { email: profile.email },
      include: {
        memberships: {
          include: {
            workspace: true
          }
        }
      }
    })) as EmailLoginUserRecord | null;

    if (existingByEmail) {
      await this.prisma.user.update({
        where: { id: existingByEmail.id },
        data: {
          authProvider: "google",
          googleId: profile.googleId,
          name: existingByEmail.name ?? profile.name,
          emailVerifiedAt:
            existingByEmail.emailVerifiedAt ??
            (profile.emailVerified ? new Date() : null)
        }
      });

      return this.createSessionForUser(existingByEmail.id, context);
    }

    const workspaceName = profile.name ?? profile.email.split("@")[0] ?? "Workspace";
    const userId = await this.prisma.$transaction(async (tx) => {
      const slug = await this.resolveWorkspaceSlug(workspaceName, tx);
      const workspace = await tx.workspace.create({
        data: {
          name: workspaceName,
          slug
        }
      });
      const user = await tx.user.create({
        data: {
          email: profile.email,
          name: profile.name,
          passwordHash: null,
          authProvider: "google",
          googleId: profile.googleId,
          emailVerifiedAt: profile.emailVerified ? new Date() : null
        }
      });

      await tx.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: user.id,
          role: "owner"
        }
      });

      return user.id;
    });

    return this.createSessionForUser(userId, context);
  }

  private async resolveWorkspaceSlug(
    workspaceName: string,
    tx: Pick<PrismaService, "workspace">
  ): Promise<string> {
    const baseSlug = this.slugify(workspaceName);
    let candidate = baseSlug;
    let suffix = 2;

    while (
      await tx.workspace.findUnique({
        where: { slug: candidate }
      })
    ) {
      candidate = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    return candidate;
  }

  private toAuthenticatedUser(user: EmailLoginUserRecord): AuthenticatedUser {
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        authProvider: user.authProvider ?? "email",
        emailVerifiedAt: user.emailVerifiedAt ?? null
      },
      workspaces: user.memberships.map((membership) => ({
        id: membership.workspace.id,
        name: membership.workspace.name,
        slug: membership.workspace.slug,
        role: membership.role
      }))
    };
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private asString(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value : null;
  }

  private slugify(value: string): string {
    const slug = value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    return slug || "workspace";
  }

  private hashRefreshToken(refreshToken: string): string {
    return createHash("sha256").update(refreshToken).digest("hex");
  }

  private hashAuthIdentity(email: string): string {
    return createHash("sha256")
      .update(this.normalizeEmail(email))
      .digest("hex");
  }

  private async assertLoginNotRateLimited(
    email: string,
    context: AuthRequestContext
  ): Promise<void> {
    const filters: Array<{ targetId?: string; sourceIp?: string }> = [
      {
        targetId: this.hashAuthIdentity(email)
      }
    ];

    if (context.ipAddress) {
      filters.push({ sourceIp: context.ipAddress });
    }

    const recentFailures = await this.prisma.auditLog.count({
      where: {
        action: "auth.login_failed",
        resultStatus: "failed",
        createdAt: {
          gte: new Date(Date.now() - loginFailureWindowMs)
        },
        OR: filters
      }
    });

    if (recentFailures >= loginFailureLimit) {
      throw new HttpException(
        "Muitas tentativas de login. Tente novamente em alguns minutos.",
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
  }

  private async isPasswordResetRequestRateLimited(
    email: string,
    context: AuthRequestContext
  ): Promise<boolean> {
    const filters: Array<{ targetId?: string; sourceIp?: string }> = [
      {
        targetId: this.hashAuthIdentity(email)
      }
    ];

    if (context.ipAddress) {
      filters.push({ sourceIp: context.ipAddress });
    }

    const recentRequests = await this.prisma.auditLog.count({
      where: {
        action: "auth.password_reset_requested",
        createdAt: {
          gte: new Date(Date.now() - passwordResetRequestWindowMs)
        },
        OR: filters
      }
    });

    return recentRequests >= passwordResetRequestLimit;
  }

  private async recordPasswordResetRequest(
    email: string,
    userId: string | null,
    context: AuthRequestContext,
    resultStatus: "queued" | "rate_limited"
  ): Promise<void> {
    await this.safeCreateAuditLog({
      workspaceId: null,
      actorUserId: userId,
      actorType: userId ? "user" : "anonymous",
      action: "auth.password_reset_requested",
      targetType: "AuthIdentity",
      targetId: this.hashAuthIdentity(email),
      reason:
        resultStatus === "rate_limited"
          ? "Limite de recuperacao de senha atingido"
          : null,
      sourceIp: context.ipAddress ?? null,
      resultStatus,
      beforeSummary: null,
      afterSummary: {
        delivery: this.getTokenDelivery(),
        userAgent: context.userAgent ?? null
      }
    });
  }

  private async recordLoginFailure(
    email: string,
    context: AuthRequestContext
  ): Promise<void> {
    await this.safeCreateAuditLog({
      workspaceId: null,
      actorUserId: null,
      actorType: "anonymous",
      action: "auth.login_failed",
      targetType: "AuthIdentity",
      targetId: this.hashAuthIdentity(email),
      reason: "Credenciais invalidas",
      sourceIp: context.ipAddress ?? null,
      resultStatus: "failed",
      beforeSummary: null,
      afterSummary: {
        userAgent: context.userAgent ?? null
      }
    });
  }

  private async recordLoginSuccess(
    session: AuthSessionResult,
    context: AuthRequestContext
  ): Promise<void> {
    await this.safeCreateAuditLog({
      workspaceId: session.workspaces[0]?.id ?? null,
      actorUserId: session.user.id,
      actorType: "user",
      action: "auth.login_succeeded",
      targetType: "User",
      targetId: session.user.id,
      reason: null,
      sourceIp: context.ipAddress ?? null,
      resultStatus: "success",
      beforeSummary: null,
      afterSummary: {
        authProvider: session.user.authProvider,
        userAgent: context.userAgent ?? null
      }
    });
  }

  private async safeCreateAuditLog(input: {
    workspaceId: string | null;
    actorUserId: string | null;
    actorType: string;
    action: string;
    targetType: string;
    targetId: string;
    reason: string | null;
    sourceIp: string | null;
    resultStatus: string;
    beforeSummary: unknown;
    afterSummary: unknown;
  }): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          workspaceId: input.workspaceId,
          actorUserId: input.actorUserId,
          actorType: input.actorType,
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId,
          reason: input.reason,
          sourceIp: input.sourceIp,
          resultStatus: input.resultStatus,
          beforeSummary:
            input.beforeSummary === null
              ? undefined
              : (input.beforeSummary as Prisma.InputJsonValue),
          afterSummary:
            input.afterSummary === null
              ? undefined
              : (input.afterSummary as Prisma.InputJsonValue)
        }
      });
    } catch {
      return;
    }
  }

  private createOAuthState(redirectTo?: string): string {
    const payload = JSON.stringify({
      redirectTo: redirectTo ?? "/overview",
      nonce: randomBytes(16).toString("hex")
    });

    return Buffer.from(payload).toString("base64url");
  }

  private readOAuthRedirect(state: string): string {
    try {
      const decoded = JSON.parse(
        Buffer.from(state, "base64url").toString("utf8")
      ) as { redirectTo?: unknown };

      return typeof decoded.redirectTo === "string" && decoded.redirectTo
        ? decoded.redirectTo
        : "/overview";
    } catch {
      return "/overview";
    }
  }

  private async createActionToken(
    userId: string,
    type: AuthActionTokenType,
    ttlMs: number
  ): Promise<PasswordResetRequestDto | EmailVerificationStartDto> {
    const token = randomBytes(32).toString("hex");

    await this.prisma.authActionToken.create({
      data: {
        userId,
        type,
        tokenHash: this.hashActionToken(token),
        expiresAt: new Date(Date.now() + ttlMs)
      }
    });

    return {
      ok: true,
      delivery: this.getTokenDelivery(),
      devToken: this.env.AUTH_EXPOSE_DEV_TOKENS === "true" ? token : null
    };
  }

  private async consumeActionToken(
    type: AuthActionTokenType,
    token: string
  ): Promise<string> {
    const record = (await this.prisma.authActionToken.findFirst({
      where: {
        type,
        tokenHash: this.hashActionToken(token),
        usedAt: null
      }
    })) as AuthActionTokenRecord | null;

    if (!record || record.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException("Token invalido ou expirado");
    }

    await this.prisma.authActionToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() }
    });

    return record.userId;
  }

  private async assertUserExists(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw this.invalidCredentials();
    }
  }

  private getTokenDelivery(): "email_queued" | "not_configured" {
    return this.env.EMAIL_PROVIDER ? "email_queued" : "not_configured";
  }

  private hashActionToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private invalidCredentials(): UnauthorizedException {
    return new UnauthorizedException("Credenciais invalidas");
  }
}
