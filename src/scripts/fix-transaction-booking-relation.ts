/**
 * One-off: unblock TypeORM's synchronize on the `transactions` table.
 *
 * The `transactions.booking` relation changed from OneToOne to ManyToOne
 * (a booking legitimately needs more than one transaction row — payment +
 * payout + commission). synchronize (on by default in this app whenever
 * DB_SYNCHRONIZE isn't set — see app.module.ts) then tried to reconcile the
 * old OneToOne-generated schema (a UNIQUE index backing the FK) against the
 * new ManyToOne metadata, but got stuck: it can't drop the old index while
 * the FK still depends on it, so the app was crash-looping on boot.
 *
 * This drops the stale FK + index through TypeORM's own QueryRunner schema
 * API (not raw SQL) so synchronize can finish recreating the correct
 * ManyToOne-shaped schema on the app's next boot.
 *
 * Uses a standalone DataSource with synchronize explicitly off — booting via
 * AppModule would hit the same broken auto-sync before this code could run.
 *
 * Usage: npm run fix:tx-booking-relation
 */
import { DataSource } from 'typeorm';

async function run() {
  const dataSource = new DataSource({
    type: 'mysql',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    database: process.env.DB_DATABASE || 'ikigaidb',
    username: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || 'kabadelivery',
    synchronize: false,
  });

  await dataSource.initialize();
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();

  try {
    const table = await queryRunner.getTable('transactions');
    if (!table) throw new Error('transactions table not found');

    const fk = table.foreignKeys.find((f) => f.columnNames.includes('bookingId'));
    if (fk) {
      console.log(`Dropping foreign key ${fk.name} on transactions.bookingId…`);
      await queryRunner.dropForeignKey('transactions', fk);
    } else {
      console.log('No foreign key on transactions.bookingId — nothing to drop.');
    }

    const staleIndex = table.indices.find(
      (i) => i.columnNames.includes('bookingId') && i.name === 'IDX_transactions_bookingId',
    );
    if (staleIndex) {
      console.log(`Dropping stale index ${staleIndex.name}…`);
      await queryRunner.dropIndex('transactions', staleIndex);
    } else {
      console.log('No stale IDX_transactions_bookingId index — nothing to drop.');
    }

    console.log('Done. TypeORM synchronize should now recreate the correct ManyToOne-shaped schema on next boot.');
  } finally {
    await queryRunner.release();
    await dataSource.destroy();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
