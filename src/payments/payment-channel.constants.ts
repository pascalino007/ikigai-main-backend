/** How the customer pays at the aggregator (card vs mobile money). */
export const PaymentChannel = {
  CARD: 'card',
  MOBILE_MONEY: 'mobile_money',
} as const;

export type PaymentChannelId =
  (typeof PaymentChannel)[keyof typeof PaymentChannel];
