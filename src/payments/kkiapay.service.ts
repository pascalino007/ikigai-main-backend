import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class KkiapayService {
  private readonly logger = new Logger(KkiapayService.name);
  private readonly publicKey: string | undefined;
  private readonly privateKey: string | undefined;
  private readonly secret: string | undefined;
  private readonly isSandbox: boolean;

  constructor(private readonly config: ConfigService) {
    this.publicKey = this.config.get<string>('KKIAPAY_PUBLIC_KEY');
    this.privateKey = this.config.get<string>('KKIAPAY_PRIVATE_KEY');
    this.secret = this.config.get<string>('KKIAPAY_SECRET');
    this.isSandbox =
      this.config.get<string>('KKIAPAY_SANDBOX', 'true') === 'true';

    if (this.privateKey) {
      this.logger.log(
        `Kkiapay initialized (sandbox=${this.isSandbox})`,
      );
    } else {
      this.logger.warn(
        'KKIAPAY_PRIVATE_KEY not set – Kkiapay payments will fall back to sandbox',
      );
    }
  }

  get isConfigured(): boolean {
    return !!this.privateKey;
  }

  /**
   * Returns the payload the mobile app needs to open the Kkiapay widget.
   * The widget handles the full mobile money flow client-side;
   * Kkiapay then calls our webhook with the result.
   */
  buildWidgetPayload(params: {
    amount: number;
    transactionRef: string;
    reason?: string;
  }): Record<string, unknown> {
    return {
      provider: 'kkiapay',
      publicKey: this.publicKey ?? '',
      amount: params.amount,
      reason: params.reason ?? 'Ikigai wallet top-up',
      sandbox: this.isSandbox,
      transactionRef: params.transactionRef,
      data: params.transactionRef,
    };
  }

  /**
   * Verify a Kkiapay transaction server-side after webhook or callback.
   * Calls https://api.kkiapay.me/api/v1/transactions/status
   */
  async verifyTransaction(
    transactionId: string,
  ): Promise<{ status: string; amount?: number }> {
    if (!this.privateKey) {
      this.logger.warn('Kkiapay not configured, returning sandbox success');
      return { status: 'SUCCESS', amount: 0 };
    }

    try {
      const response = await fetch(
        'https://api.kkiapay.me/api/v1/transactions/status',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-private-key': this.privateKey,
            'x-secret': this.secret ?? '',
          },
          body: JSON.stringify({ transactionId }),
        },
      );

      if (!response.ok) {
        this.logger.error(
          `Kkiapay verify failed: ${response.status} ${response.statusText}`,
        );
        return { status: 'FAILED' };
      }

      const data = (await response.json()) as Record<string, unknown>;
      return {
        status: String(data.status ?? 'UNKNOWN').toUpperCase(),
        amount: typeof data.amount === 'number' ? data.amount : undefined,
      };
    } catch (err) {
      this.logger.error('Kkiapay verify error', err);
      return { status: 'FAILED' };
    }
  }
}
