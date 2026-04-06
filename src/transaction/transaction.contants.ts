export const TransactionStatus = {
  FAILED: -1,
  PENDING: 0,
  SUCCESS: 1,
} as const;

export const TransactionMotif = {
  WALLET_DEPOSIT: 1,
  SUBSCRIPTION: 2,
  ORDER_PAYMENT: 3,
  DELIVERY_PAYMENT: 4,
  PROVIDER_PAYOUT: 5,
  ADMIN_COMMISSION: 6,
  REFUND: 7,
  WITHDRAWAL: 8,
  /** External card / MoMo payment for a confirmed appointment */
  BOOKING_PAYMENT: 9,
} as const;
