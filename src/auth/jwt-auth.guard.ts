import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

/** Verifies the `Authorization: Bearer <jwt>` header and sets `req.user`. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const route = `${req.method} ${req.originalUrl ?? req.url}`;
    const header: string | undefined =
      req.headers?.authorization ?? req.headers?.Authorization;

    if (!header || !header.startsWith('Bearer ')) {
      this.logger.warn(
        `[401] ${route}: no bearer header present (got: ${header ? 'non-Bearer value' : 'nothing'})`,
      );
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = header.slice(7);
    try {
      const payload = this.jwt.verify(token);
      // signin payload is { email, sub: userId, role }
      req.user = { id: payload.sub, email: payload.email, role: payload.role };
      return true;
    } catch (err: any) {
      // Decoding (unlike verifying) never throws on a well-formed-but-invalid
      // token, so this still tells us *whose* token it was even when the
      // signature/expiry check failed — essential for telling "this user's
      // session genuinely expired" apart from "wrong/stale token sent".
      let subject = '(undecodable)';
      try {
        const decoded: any = this.jwt.decode(token);
        if (decoded && typeof decoded === 'object') {
          subject = `sub=${decoded.sub ?? '?'} email=${decoded.email ?? '?'} exp=${
            decoded.exp ? new Date(decoded.exp * 1000).toISOString() : '?'
          }`;
        }
      } catch {
        // token isn't even well-formed JWT — leave subject as '(undecodable)'
      }
      this.logger.warn(
        `[401] ${route}: verify failed (${err?.name ?? 'Error'}: ${err?.message ?? err}) — ${subject}`,
      );
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
