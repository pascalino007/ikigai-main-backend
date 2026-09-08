import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Product-level mobile money network as used across the rest of the app. */
export type PaygateNetwork = 'FLOOZ' | 'TMONEY';

/** PayGateGlobal's own telecom operator codes, used only on the hosted payment page. */
const TELCO_BY_NETWORK: Record<PaygateNetwork, string> = {
  FLOOZ: 'MOOV',
  TMONEY: 'TOGOCEL',
};

@Injectable()
export class PaygateService {
  private readonly logger = new Logger(PaygateService.name);
  private readonly authToken: string | undefined;
  private readonly pageUrl: string;

  /**
   * Where PayGateGlobal both redirects the customer's browser after payment
   * and POSTs the JSON confirmation (see Méthode 2 docs). Points at our own
   * generic webhook route, handled by PaymentWebhookController.
   */
  readonly returnUrl: string;

  constructor(private readonly config: ConfigService) {
    this.authToken = this.config.get<string>('PAYGATE_AUTH_TOKEN');
    this.pageUrl =
      this.config.get<string>('PAYGATE_PAGE_URL') ??
      'https://paygateglobal.com/v1/page';
    const apiPublicUrl =
      this.config.get<string>('API_PUBLIC_URL') ?? 'https://api.ikilist.com';
    this.returnUrl = `${apiPublicUrl}/payments/webhooks/paygate`;

    if (this.authToken) {
      this.logger.log('PayGateGlobal initialized');
    } else {
      this.logger.warn(
        'PAYGATE_AUTH_TOKEN not set – PayGate payments will fall back to sandbox',
      );
    }
  }

  get isConfigured(): boolean {
    return !!this.authToken;
  }

  /**
   * Builds the hosted PayGateGlobal payment page URL (Méthode 2). The mobile
   * app opens this in a webview; the customer pays there, PayGateGlobal
   * redirects the browser back to `returnUrl` and separately POSTs a
   * confirmation JSON to that same URL once the payment clears.
   */
  buildPaymentLink(params: {
    amount: number;
    transactionRef: string;
    phone?: string;
    network?: PaygateNetwork;
    description?: string;
  }): string {
    if (!this.authToken) {
      throw new BadRequestException(
        'PayGate is not configured on the server (missing PAYGATE_AUTH_TOKEN)',
      );
    }

    const query = new URLSearchParams({
      token: this.authToken,
      amount: String(params.amount),
      identifier: params.transactionRef,
      description: params.description ?? 'Ikigai wallet top-up',
      url: this.returnUrl,
    });
    if (params.phone) {
      query.set('phone', params.phone);
    }
    if (params.network) {
      query.set('network', TELCO_BY_NETWORK[params.network]);
    }

    return `${this.pageUrl}?${query.toString()}`;
  }
}
