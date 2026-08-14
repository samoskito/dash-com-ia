import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../../auth/auth.service';
import { extractAuthToken } from '../../auth/auth-token';

@Injectable()
export class WorkspaceOwnerGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const workspaceId = request.params.workspaceId || request.body.workspaceId;

    if (!workspaceId) {
      throw new ForbiddenException('Workspace ID não fornecido');
    }

    let refreshToken: string;
    try {
      refreshToken = extractAuthToken(request);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw new UnauthorizedException('Sessão inválida ou expirada');
      }
      throw error;
    }

    const authenticated = await this.authService.getSession(refreshToken);

    // Verificar se o usuário é member do workspace
    const membership = authenticated.workspaces.find((w: { id: string }) => w.id === workspaceId);
    if (!membership) {
      throw new ForbiddenException('Usuário não pertence a este workspace');
    }

    // Verificar se é owner
    if (membership.role !== 'owner') {
      throw new ForbiddenException('Apenas o owner do workspace pode executar esta operação');
    }

    // Attach user info to request for downstream use
    request.user = {
      id: authenticated.user.id,
      email: authenticated.user.email,
      workspaceRole: membership.role,
    };

    return true;
  }
}