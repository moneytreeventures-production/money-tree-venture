interface CheckoutError {
  code?: string;
  message?: string;
  details?: Array<{ field?: string }>;
}

export function checkoutOrderErrorMessage(error?: CheckoutError): string {
  switch (error?.code) {
    case "ALREADY_PURCHASED": return error.message ?? "This purchase is already available in your account. Check My Library before creating another order.";
    case "REPURCHASE_CONFIRMATION_REQUIRED": return error.message ?? "You already own a product in this cart. Visit My Library for free access, or confirm Purchase Again to continue.";
    case "REPURCHASE_CONFIRMATION_STALE": return error.message ?? "Your repurchase confirmation is out of date. Refresh checkout and try again.";
    case "ACTIVE_CHECKOUT": return error.message ?? "An earlier payment for a product in your cart is still being processed. Check your order status before trying again.";
    case "CART_DUPLICATE_ITEM": return error.message ?? "Each digital product can be purchased only once per order. Remove the duplicate from your cart.";
    case "CART_QUANTITY_INVALID": return error.message ?? "Only one license per product is supported. Update your cart and try again.";
    case "CART_EMPTY": return error.message ?? "Your cart is empty. Add a product before checkout.";
    case "CART_INVALID_ITEMS": return error.message ?? "Your cart contains invalid items. Refresh or correct your cart before checkout.";
    case "ORDER_RETRY_MISMATCH": return "Your cart changed since the last checkout attempt. Review it and try again.";
    case "ORDER_CREATE_COLLISION": return "Another checkout update interrupted this attempt. Please try again.";
    case "ORDER_CREATION_INCOMPLETE": return "Your order could not be created. Please try again.";
    case "NOT_FOUND": return "An item in your cart is no longer available. Review your cart before trying again.";
    case "CONFLICT": return "An order may already be processing. Check your account before trying again.";
    case "VALIDATION_ERROR":
      if (error.details?.some((detail) => detail.field === "couponCode")) {
        return "This coupon no longer applies to your order. Remove it or try another code.";
      }
      if (error.details?.some((detail) => detail.field?.endsWith(".quantity"))) return "Only one license per product is supported. Update your cart and try again.";
      return "Please review the items in your cart and try again.";
    default: return "Could not create your order. Please try again.";
  }
}
