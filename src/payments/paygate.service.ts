import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Product-level mobile money network as used across the rest of the app. */
export type PaygateNetwork = 'FLOOZ' | 'TMONEY';

/** PayGateGlobal's own telecom operator codes, used only on the hosted payment page (Méthode 2). */
const TELCO_BY_NETWORK: Record<PaygateNetwork, string> = {
  FLOOZ: 'MOOV',
  TMONEY: 'TOGOCEL',
};

/** PayGateGlobal status codes returned by POST /api/v1/pay (Méthode 1's *initiate* call). */
const PAYGATE_STATUS_MESSAGES: Record<number, string> = {
  2: "Jeton d'authentification PayGate invalide",
  4: 'Paramètres de paiement PayGate invalides',
  6: 'Une transaction avec cet identifiant existe déjà',
};

/**
 * PayGateGlobal's /status check codes — a completely different numbering
 * from the /pay codes above despite reusing 0/2/4/6.
 */
const PAYGATE_CHECK_STATUS = {
  SUCCESS: 0,
  PENDING: 2,
  EXPIRED: 4,
  CANCELLED: 6,
} as const;

export interface PaygateStatusResult {
  outcome: 'succeeded' | 'pending' | 'failed';
  txReference?: string;
  paymentReference?: string;
  paymentMethod?: string;
}

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
   * webview. This call only confirms the request was *registered* (status
   * 0), not that the customer actually paid — actual confirmation comes
   * from either PayGateGlobal's webhook (PaymentWebhookController, if their
   * account-level notification URL fires for this method too) or, more
   * reliably, active polling via `checkStatusByIdentifier` below.
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

    const localPhone = this.toLocalTogoDigits(params.phone);
    this.logger.log(
      `[initiate] ref=${params.transactionRef} amount=${params.amount} network=${params.network} phone=${this.maskPhone(localPhone)}`,
    );

    let response: Response;
    try {
      response = await fetch('https://paygateglobal.com/api/v1/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auth_token: this.authToken,
          phone_number: localPhone,
          amount: params.amount,
          description: params.description ?? 'Ikigai wallet top-up',
          identifier: params.transactionRef,
          network: params.network,
        }),
      });
    } catch (err) {
      this.logger.error(
        `[initiate] request failed for ref=${params.transactionRef}`,
        err as Error,
      );
      throw new BadRequestException(
        'Impossible de contacter PayGate pour le moment',
      );
    }

    const data = (await response
      .json()
      .catch(() => ({}))) as Record<string, unknown>;
    const status = Number(data.status);
    this.logger.log(
      `[initiate] response for ref=${params.transactionRef}: http=${response.status} status=${data.status} tx_reference=${data.tx_reference ?? '(none)'}`,
    );

    if (status === 0) {
      return { txReference: String(data.tx_reference ?? '') };
    }

    this.logger.error(
      `[initiate] failed for ref=${params.transactionRef}: status=${data.status}`,
    );
    throw new BadRequestException(
      PAYGATE_STATUS_MESSAGES[status] ??
        `Échec de l'initialisation PayGate (status ${data.status})`,
    );
  }

  /**
   * Actively asks PayGateGlobal for a transaction's real status, keyed by
   * OUR OWN identifier (POST /api/v2/status) — no need to track PayGate's
   * tx_reference separately. This is the authoritative confirmation source
   * for Méthode 1 (which has no reliable push-based webhook): call this
   * while the client polls our own transaction-status endpoint.
   *
   * Unknown/unrecognized status codes map to 'pending' rather than 'failed'
   * — a false "still waiting" is recoverable, a false "failed" on a
   * genuinely successful payment is not.
   */
  async checkStatusByIdentifier(identifier: string): Promise<PaygateStatusResult | null> {
    if (!this.authToken) return null;

    let response: Response;
    try {
      response = await fetch('https://paygateglobal.com/api/v2/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auth_token: this.authToken, identifier }),
      });
    } catch (err) {
      this.logger.error(`[status] request failed for ref=${identifier}`, err as Error);
      return null;
    }

    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    // PayGate returns a distinct { error_code, error_message } shape (e.g.
    // error_code 403 "Transaction non trouvée") when it has no record of
    // this identifier at all — as opposed to a numeric `status` for one it
    // does recognize. That happens when the original /pay initiate call
    // never actually registered with them (network blip, rejected params,
    // etc.), and it will NEVER resolve to success no matter how many more
    // times we ask — treat it as a definitive failure instead of the
    // "unparseable -> keep retrying" fallback, which previously left dead
    // transactions being re-checked every minute for hours for nothing.
    if (typeof data.error_code !== 'undefined') {
      this.logger.warn(
        `[status] ref=${identifier}: PayGate doesn't recognize this transaction (error_code=${data.error_code} message=${data.error_message ?? '(none)'}) — treating as failed`,
      );
      return { outcome: 'failed' };
    }

    const status = Number(data.status);
    if (Number.isNaN(status)) {
      this.logger.warn(
        `[status] unparseable response for ref=${identifier}: http=${response.status} body=${JSON.stringify(data)}`,
      );
      return null;
    }

    const outcome: PaygateStatusResult['outcome'] =
      status === PAYGATE_CHECK_STATUS.SUCCESS
        ? 'succeeded'
        : status === PAYGATE_CHECK_STATUS.EXPIRED || status === PAYGATE_CHECK_STATUS.CANCELLED
          ? 'failed'
          : 'pending';

    this.logger.log(
      `[status] ref=${identifier}: status=${status} -> outcome=${outcome} tx_reference=${data.tx_reference ?? '(none)'}`,
    );

    return {
      outcome,
      txReference: typeof data.tx_reference === 'string' ? data.tx_reference : undefined,
      paymentReference: typeof data.payment_reference === 'string' ? data.payment_reference : undefined,
      paymentMethod: typeof data.payment_method === 'string' ? data.payment_method : undefined,
    };
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

  /** e.g. "90171212" -> "90****12" — enough to spot in logs without exposing the full number. */
  private maskPhone(phone?: string): string {
    if (!phone) return '(none)';
    if (phone.length <= 4) return phone;
    return `${phone.slice(0, 2)}****${phone.slice(-2)}`;
  }
}
