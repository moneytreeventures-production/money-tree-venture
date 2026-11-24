export function orderPaymentMessage(orderStatus: string | undefined, paymentStatus: string | undefined, isExpired: boolean): string {
  if (paymentStatus === "paid" && orderStatus === "paid") return "Payment confirmed. Your order is complete.";
  if (paymentStatus === "pending") return "Payment is still processing. Check the payment status again shortly.";
  if (paymentStatus === "failed") return isExpired
    ? "Payment was not completed and this order has expired. Use Try Payment Again to start a new checkout at current prices."
    : "The last payment attempt failed. We are confirming when a new checkout is safe.";
  if (isExpired || orderStatus === "expired") return "This order has expired. Return to your cart to create a new order at current prices.";
  if (orderStatus === "cancelled") return "This order was cancelled. Return to your cart to start again.";
  if (orderStatus === "refunded" || paymentStatus === "refunded") return "This order has been refunded.";
  if (orderStatus === "partially_refunded" || paymentStatus === "partially_refunded") return "This order is being updated after a partial refund.";
  return "Order status is being verified. Please check again shortly.";
}

/** Keep the exact lifecycle meaning visible across account lists and details. */
export function orderStatusLabel(order: { orderStatus: string; paymentStatus: string }): string {
  if (order.paymentStatus === "pending") return "Processing payment";
  if (order.orderStatus === "refunded" || order.paymentStatus === "refunded") return "Refunded";
  if (order.orderStatus === "cancelled") return "Cancelled";
  if (order.orderStatus === "expired") return "Expired";
  if (order.orderStatus === "paid" && order.paymentStatus === "paid") return "Completed";
  if (order.paymentStatus === "failed") return "Failed";
  if (order.orderStatus === "partially_refunded" || order.paymentStatus === "partially_refunded") return "Refund in progress";
  return "Awaiting payment";
}
