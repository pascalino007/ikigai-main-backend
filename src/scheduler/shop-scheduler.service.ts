import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Shops } from '../shops/shop.entity';
import { ShopsService } from '../shops/shops.service';
import { MailService } from '../mail/mail.service';

@Injectable()
export class ShopSchedulerService {
  private readonly logger = new Logger(ShopSchedulerService.name);

  constructor(
    @InjectRepository(Shops)
    private readonly shopsRepository: Repository<Shops>,
    private readonly shopsService: ShopsService,
    private readonly mailService: MailService,
  ) {}

  /**
   * Runs every minute.
   * For shops in auto mode (status = 'ouvert' | 'open'), compares the live
   * computed status against the last recorded auto_status.
   * On transition (closed→open or open→closed) it persists the new state
   * and sends an email to the shop's email address.
   */
  @Cron('* * * * *')
  async checkShopStatuses(): Promise<void> {
    let shops: Shops[];
    try {
      shops = await this.shopsRepository.find({ where: { is_active: true } });
    } catch (err) {
      this.logger.error(`Failed to load shops for status check: ${err.message}`);
      return;
    }

    for (const shop of shops) {
      const manualStatus = (shop.status || 'ouvert').toLowerCase().trim();
      if (manualStatus !== 'ouvert' && manualStatus !== 'open') {
        continue;
      }

      const computed = this.shopsService.computeEffectiveStatus(shop);
      const isNowOpen = computed !== 'closed';

      if (shop.auto_status === null || shop.auto_status === undefined) {
        shop.auto_status = computed;
        await this.shopsRepository.save(shop);
        continue;
      }

      const wasOpen = shop.auto_status !== 'closed';

      if (isNowOpen && !wasOpen) {
        shop.auto_status = computed;
        await this.shopsRepository.save(shop);
        await this.notifyOpen(shop);
      } else if (!isNowOpen && wasOpen) {
        shop.auto_status = 'closed';
        await this.shopsRepository.save(shop);
        await this.notifyClose(shop);
      }
    }
  }

  private async notifyOpen(shop: Shops): Promise<void> {
    if (!shop.email) return;
    this.logger.log(`Shop #${shop.id} "${shop.name}" opened — notifying ${shop.email}`);
    await this.mailService.sendMail({
      to: shop.email,
      subject: `✅ Votre boutique "${shop.name}" est maintenant ouverte`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:auto">
          <h2 style="color:#4CAF50">🟢 Boutique ouverte</h2>
          <p>Bonjour,</p>
          <p>Votre boutique <strong>${shop.name}</strong> est maintenant <strong>ouverte</strong> selon vos horaires configurés.</p>
          <p>Les clients peuvent désormais réserver vos services.</p>
          <hr/>
          <p style="font-size:12px;color:#888">Ikigai — plateforme de beauté &amp; bien-être</p>
        </div>
      `,
    });
  }

  private async notifyClose(shop: Shops): Promise<void> {
    if (!shop.email) return;
    this.logger.log(`Shop #${shop.id} "${shop.name}" closed — notifying ${shop.email}`);
    await this.mailService.sendMail({
      to: shop.email,
      subject: `🔒 Votre boutique "${shop.name}" est maintenant fermée`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:auto">
          <h2 style="color:#F44336">🔴 Boutique fermée</h2>
          <p>Bonjour,</p>
          <p>Votre boutique <strong>${shop.name}</strong> vient de <strong>fermer</strong> selon vos horaires configurés.</p>
          <p>Les nouvelles réservations sont suspendues jusqu'à la prochaine ouverture.</p>
          <hr/>
          <p style="font-size:12px;color:#888">Ikigai — plateforme de beauté &amp; bien-être</p>
        </div>
      `,
    });
  }
}
