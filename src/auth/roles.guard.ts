import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';

/**
 * Checks `req.user.role` (set by JwtAuthGuard, which must run first) against
 * the roles listed in @Roles(...) on the route/controller. No @Roles() means
 * no restriction — this guard only narrows, it never grants access on its own.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest();
    const role: string | undefined = req.user?.role;
    const route = `${req.method} ${req.originalUrl ?? req.url}`;

    if (!role || !requiredRoles.includes(role)) {
      this.logger.warn(
        `[403] ${route}: role "${role ?? '(none)'}" not in [${requiredRoles.join(', ')}] (user=${req.user?.id ?? '?'})`,
      );
      throw new ForbiddenException('You do not have permission to perform this action');
    }

    return true;
  }
}
