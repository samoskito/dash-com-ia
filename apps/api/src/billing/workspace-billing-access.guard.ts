import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { extractAuthToken } from "../auth/auth-token";
import { AuthService } from "../auth/auth.service";
import { PackageBillingConfiguration } from "./package-billing.configuration";
import { WorkspacePackageAccessService } from "./workspace-package-access.service";

type BillingGuardRequest = {
  headers: Record<string, string | string[] | undefined>;
  method?: string;
  originalUrl?: string;
  path?: string;
  url?: string;
};

const PUBLIC_OR_RECOVERY_PREFIXES = [
  "/auth",
  "/backoffice",
  "/billing",
  "/health",
  "/webhooks",
];

@Injectable()
export class WorkspaceBillingAccessGuard implements CanActivate {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(PackageBillingConfiguration)
    private readonly configuration: PackageBillingConfiguration,
    @Inject(WorkspacePackageAccessService)
    private readonly access: WorkspacePackageAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      context.getType() !== "http" ||
      !this.configuration.isPackageBillingEnabled() ||
      !this.configuration.isEnforcementEnabled()
    ) {
      return true;
    }

    const request = context.switchToHttp().getRequest<BillingGuardRequest>();
    const method = (request.method ?? "GET").toUpperCase();
    const path = this.requestPath(request);

    if (this.isRecoveryPath(method, path)) {
      return true;
    }

    let refreshToken: string;
    try {
      refreshToken = extractAuthToken(request);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        return true;
      }

      throw error;
    }

    const authenticated = await this.authService.getSession(refreshToken);

    if (authenticated.supportContext) {
      return true;
    }

    const workspaceId =
      authenticated.activeWorkspaceId ??
      (authenticated.workspaces.length === 1
        ? (authenticated.workspaces[0]?.id ?? null)
        : null);

    if (!workspaceId) {
      return true;
    }

    const access = await this.access.getWorkspaceAccessState(workspaceId);

    if (access.allowed) {
      return true;
    }

    throw new ForbiddenException({
      statusCode: 403,
      code: "workspace_billing_access_suspended",
      message:
        "Assinatura inativa. Acesse Assinatura para regularizar o acesso.",
      billingAccess: access,
    });
  }

  private isRecoveryPath(method: string, path: string): boolean {
    if (method === "OPTIONS") {
      return true;
    }

    if (
      PUBLIC_OR_RECOVERY_PREFIXES.some(
        (prefix) => path === prefix || path.startsWith(`${prefix}/`),
      )
    ) {
      return true;
    }

    if (path === "/workspaces" && (method === "GET" || method === "HEAD")) {
      return true;
    }

    if (
      path === "/workspaces/current" &&
      (method === "GET" || method === "HEAD")
    ) {
      return true;
    }

    if (path === "/workspaces/active" && method === "POST") {
      return true;
    }

    if (
      path === "/workspaces/invites" ||
      path.startsWith("/workspaces/invites/")
    ) {
      return true;
    }

    return (
      path === "/integrations/whatsapp/instances" &&
      (method === "GET" || method === "HEAD")
    );
  }

  private requestPath(request: BillingGuardRequest): string {
    const rawPath = request.originalUrl ?? request.url ?? request.path ?? "/";
    const path = rawPath.split("?")[0] || "/";

    return path.length > 1 ? path.replace(/\/+$/, "") : path;
  }
}
