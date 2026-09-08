import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Product-level mobile money network as used across the rest of the app. */
export type PaygateNetwork = 'FLOOZ' | 'TMONEY';

/** PayGateGlobal's own telecom operator codes, used only on the hosted payment page (Méthode 2). */
const TELCO_BY_NETWORK: Record<PaygateNetwork, string> = {
  FLOOZ: 'MOOV',
  TMONEY: 'TOGOCEL',
};

/** PayGateGlobal status codes returned by POST /api/v1/pay (Méthode 1). */
const PAYGATE_STATUS_MESSAGES: Record<number, string> = {
  2: "Jeton d'authentification PayGate invalide",
  4: 'Paramètres de paiement PayGate invalides',
  6: 'Une transaction avec cet identifiant existe déjà',
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
   * Méthode 1 — pushes a mobile money debit request straight to the
   * customer's phone (Flooz/Moov or T-Money USSD prompt); no page, no
   * webview. CAUTION: PayGateGlobal's own docs describe no webhook or
   * status-check for this method — this call only confirms the request was
   * *registered* (status 0), not that the customer actually paid. Whether
   * the wallet ever gets credited depends entirely on whether a
   * dashboard-level "notification URL" (if PayGate's merchant console has
   * one) also fires for Méthode 1 transactions, POSTing to the same
   * `returnUrl` Méthode 2 uses. Unverified — see PaymentWebhookController.
   */
  async initiatePayment(params: {
    amount: number;
    phone: string;
    network: PaygateNetwork;
    transactionRef: string;
    description?: string;
  }): Promise<{ txReference: string }> {
    if (!this.authToken) {
      throw new BadRequestException(
        'PayGate is not configured on the server (missing PAYGATE_AUTH_TOKEN)',
      );
    }

    let response: Response;
    try {
      response = await fetch('https://paygateglobal.com/api/v1/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auth_token: this.authToken,
          phone_number: this.toLocalTogoDigits(params.phone),
          amount: params.amount,
          description: params.description ?? 'Ikigai wallet top-up',
          identifier: params.transactionRef,
          network: params.network,
        }),
      });
    } catch (err) {
      this.logger.error('PayGate initiate request failed', err as Error);
      throw new BadRequestException(
        'Impossible de contacter PayGate pour le moment',
      );
    }

    const data = (await response
      .json()
      .catch(() => ({}))) as Record<string, unknown>;
    const status = Number(data.status);

    if (status === 0) {
      return { txReference: String(data.tx_reference ?? '') };
    }

    this.logger.error(
      `PayGate initiate failed for ${params.transactionRef}: status=${data.status}`,
    );
    throw new BadRequestException(
      PAYGATE_STATUS_MESSAGES[status] ??
        `Échec de l'initialisation PayGate (status ${data.status})`,
    );
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
    const localPhone = this.toLocalTogoDigits(params.phone);
    if (localPhone) {
      query.set('phone', localPhone);
    }
    if (params.network) {
      query.set('network', TELCO_BY_NETWORK[params.network]);
    }

    return `${this.pageUrl}?${query.toString()}`;
  }

  /**
   * PayGateGlobal's `phone` param wants the bare 8-digit Togo local number
   * (no `+228`/`00228`) — sending it with a country code makes their page
   * fail to recognize the number/network, which then falls back to showing
   * the customer a manual network-selection step.
   */
  private toLocalTogoDigits(phone?: string): string | undefined {
    if (!phone) return undefined;
    const digits = phone.replace(/\D/g, '');
    return digits.length >= 8 ? digits.slice(-8) : digits || undefined;
  }
}
