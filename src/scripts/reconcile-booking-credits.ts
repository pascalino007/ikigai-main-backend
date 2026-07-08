/**
 * One-off reconciliation: credit any completed booking whose provider payout
 * is missing (e.g. lost to the old race condition / swallowed subscriber error).
 *
 * Safe to run repeatedly — crediting is idempotent per booking.
 *
 * Usage:
 *   npm run reconcile:wallets                 # all shops, applies credits
 *   npm run reconcile:wallets -- --dry-run    # report only, change nothing
 *   npm run reconcile:wallets -- --shop=42    # limit to one shop
 *   npm run reconcile:wallets -- --shop=42 --dry-run
 */
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../app.module';
import { ProWalletService } from '../providers/pro_wallet/pro_wallet.service';

async function run() {
  const logger = new Logger('ReconcileBookingCredits');
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const shopArg = args.find((a) => a.startsWith('--shop='));
  const shopId = shopArg ? parseInt(shopArg.split('=')[1], 10) : undefined;

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const svc = app.get(ProWalletService);
    logger.log(
      `Reconciling booking credits${shopId ? ` for shop ${shopId}` : ' (all shops)'}` +
        `${dryRun ? ' [DRY RUN — no changes]' : ''}…`,
    );

    const r = await svc.reconcileBookingCredits({ shopId, dryRun });

    logger.log(`Scanned ${r.scanned} completed booking(s).`);
    logger.log(`Already credited: ${r.alreadyCredited}.`);
    logger.log(
      `${dryRun ? 'Would credit' : 'Credited'}: ${r.credited} booking(s), ` +
        `total ${r.amountCredited} XOF.`,
    );
    if (r.creditedBookingIds.length) {
      logger.log(`Booking IDs: ${r.creditedBookingIds.join(', ')}`);
    }
  } finally {
    await app.close();
  }
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
