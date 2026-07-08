import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Bookings } from './bookings.entity';
import { BookingStatus } from './booking-status.constants';
import { Shops } from '../../shops/shop.entity';
import { Users } from '../../users/user.entity';
import { Services } from '../../services/services.entity';
import { MailService } from '../../mail/mail.service';

interface BookingMailContext {
  email: string;
  providerName: string;
  shopName: string;
  serviceName: string;
  clientName: string;
  clientPhone: string;
  date: string;
  time: string;
  amount: number;
  currency: string;
}

/**
 * Sends transactional emails to the provider about their bookings:
 *  - a new booking (with all the details), and
 *  - any status change (confirmed / in service / done / cancelled / no-show / failed).
 *
 * All methods are best-effort and never throw — a mail failure must not break
 * the booking flow.
 */
@Injectable()
export class BookingMailService {
  private readonly logger = new Logger(BookingMailService.name);

  constructor(
    @InjectRepository(Shops) private readonly shopsRepo: Repository<Shops>,
    @InjectRepository(Users) private readonly usersRepo: Repository<Users>,
    @InjectRepository(Services) private readonly servicesRepo: Repository<Services>,
    private readonly mail: MailService,
  ) {}

  private statusLabel(status: number): string {
    switch (status) {
      case BookingStatus.PENDING_PAYMENT:
        return 'En attente de paiement';
      case BookingStatus.CONFIRMED:
        return 'Confirmé';
      case BookingStatus.CANCELLED:
        return 'Annulé';
      case BookingStatus.PAYMENT_FAILED:
        return 'Paiement échoué';
      case BookingStatus.IN_SERVICE:
        return 'En cours';
      case BookingStatus.DONE:
        return 'Terminé';
      case BookingStatus.NO_SHOW:
        return 'Client absent (no-show)';
      default:
        return 'Inconnu';
    }
  }

  /** Accent color used in the email header for a given status. */
  private statusColor(status: number): string {
    switch (status) {
      case BookingStatus.CONFIRMED:
        return '#0D5C52';
      case BookingStatus.DONE:
        return '#16A34A';
      case BookingStatus.CANCELLED:
      case BookingStatus.PAYMENT_FAILED:
        return '#B91C1C';
      case BookingStatus.IN_SERVICE:
        return '#B8860B';
      case BookingStatus.NO_SHOW:
        return '#B45309';
      default:
        return '#002D39';
    }
  }

  private fmtAmount(amount: number, currency: string): string {
    const grouped = `${amount}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return `${grouped} ${currency}`;
  }

  private async buildContext(booking: Bookings): Promise<BookingMailContext | null> {
    const shop = await this.shopsRepo.findOne({ where: { id: booking.provider_id } });
    if (!shop) return null;
    const provider = shop.user_id
      ? await this.usersRepo.findOne({ where: { id: shop.user_id } })
      : null;
    const email = provider?.email;
    if (!email) return null;

    const service = await this.servicesRepo.findOne({ where: { id: booking.service_id } });
    const client = booking.user_id
      ? await this.usersRepo.findOne({ where: { id: booking.user_id } })
      : null;
    const clientName = client
      ? `${client.firstname ?? ''} ${client.lastname ?? ''}`.trim()
      : '';

    let time = '';
    if (booking.booking_time) {
      const t = new Date(booking.booking_time);
      if (!isNaN(t.getTime())) time = t.toTimeString().slice(0, 5);
    }

    return {
      email,
      providerName: (provider?.firstname ?? '').trim(),
      shopName: shop.name ?? '',
      serviceName: service?.name ?? `Service #${booking.service_id}`,
      clientName: clientName || `Client #${booking.user_id}`,
      clientPhone: client?.phone ?? '',
      date: booking.booking_date ?? '',
      time,
      amount: booking.amount ?? 0,
      currency: booking.currency ?? 'XOF',
    };
  }

  private detailsTable(booking: Bookings, ctx: BookingMailContext): string {
    const row = (label: string, value: string) =>
      value
        ? `<tr>
             <td style="padding:8px 0;color:#6B7280;font-size:13px;">${label}</td>
             <td style="padding:8px 0;color:#111827;font-size:14px;font-weight:600;text-align:right;">${value}</td>
           </tr>`
        : '';
    return `
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        ${row('Service', ctx.serviceName)}
        ${row('Client', ctx.clientName)}
        ${row('Téléphone', ctx.clientPhone)}
        ${row('Date', ctx.date)}
        ${row('Heure', ctx.time)}
        ${row('Montant', this.fmtAmount(ctx.amount, ctx.currency))}
        ${row('Référence', `#${booking.id}`)}
      </table>`;
  }

  private wrap(headerColor: string, title: string, subtitle: string, body: string): string {
    return `
    <div style="background:#F3F4F6;padding:24px;font-family:Arial,Helvetica,sans-serif;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #E5E7EB;">
        <div style="background:${headerColor};padding:24px;">
          <div style="color:#ffffff;font-size:20px;font-weight:800;">${title}</div>
          <div style="color:rgba(255,255,255,0.85);font-size:13px;margin-top:4px;">${subtitle}</div>
        </div>
        <div style="padding:24px;">
          ${body}
        </div>
        <div style="padding:16px 24px;border-top:1px solid #F0F0F0;color:#9CA3AF;font-size:11px;">
          Ikigai — notification automatique. Merci de ne pas répondre à cet email.
        </div>
      </div>
    </div>`;
  }

  /** New booking for the provider, with all details. */
  async sendNewBookingEmail(booking: Bookings): Promise<void> {
    try {
      const ctx = await this.buildContext(booking);
      if (!ctx) return;
      const color = this.statusColor(BookingStatus.CONFIRMED);
      const body = `
        <p style="color:#111827;font-size:15px;margin:0 0 16px;">
          Bonjour ${ctx.providerName || ''}, vous avez une nouvelle réservation${ctx.shopName ? ` pour <strong>${ctx.shopName}</strong>` : ''}.
        </p>
        ${this.detailsTable(booking, ctx)}`;
      const html = this.wrap(color, 'Nouvelle réservation', ctx.serviceName, body);
      await this.mail.sendMail({
        to: ctx.email,
        subject: `Nouvelle réservation — ${ctx.serviceName}${ctx.date ? ` (${ctx.date})` : ''}`,
        html,
      });
    } catch (e) {
      this.logger.error(`New-booking email failed for #${booking?.id}: ${e?.message ?? e}`);
    }
  }

  /** Status change on an existing booking. */
  async sendStatusChangeEmail(booking: Bookings, oldStatus: number): Promise<void> {
    try {
      const ctx = await this.buildContext(booking);
      if (!ctx) return;
      const newLabel = this.statusLabel(booking.booking_status);
      const oldLabel = this.statusLabel(oldStatus);
      const color = this.statusColor(booking.booking_status);
      const body = `
        <p style="color:#111827;font-size:15px;margin:0 0 8px;">
          Le statut de la réservation <strong>#${booking.id}</strong> est passé de
          <strong>${oldLabel}</strong> à <strong style="color:${color};">${newLabel}</strong>.
        </p>
        <div style="margin:16px 0;">${this.detailsTable(booking, ctx)}</div>`;
      const html = this.wrap(color, `Réservation ${newLabel}`, ctx.serviceName, body);
      await this.mail.sendMail({
        to: ctx.email,
        subject: `Réservation #${booking.id} — ${newLabel}`,
        html,
      });
    } catch (e) {
      this.logger.error(`Status email failed for #${booking?.id}: ${e?.message ?? e}`);
    }
  }
}
