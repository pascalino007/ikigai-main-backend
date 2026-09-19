import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { verifyAppSignature } from './app-signature.util';

/**
 * Verifies the X-App-Id / X-App-Timestamp / X-App-Signature headers on login
 * routes, when present. Backward-compat by design: apps already installed by
 * real users don't send these headers yet, so their absence is NOT rejected
 * here — only a present-but-invalid signature is. Once every app build sends
 * these headers, this can be tightened to require them.
 */
@Injectable()
export class AppSignatureGuard implements CanActivate {
  private readonly logger = new Logger(AppSignatureGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const appId = req.headers['x-app-id'];
    if (!appId) return true;

    const timestamp = req.headers['x-app-timestamp'];
    const signature = req.headers['x-app-signature'];
    if (!timestamp || !signature || !verifyAppSignature(String(appId), String(timestamp), String(signature))) {
      this.logger.warn(`[401] invalid app signature for X-App-Id=${appId}`);
      throw new UnauthorizedException('Invalid app signature');
    }
    return true;
  }
}
