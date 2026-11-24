export const PHONE_VALIDATION_MESSAGE = "Please enter a valid 10-digit mobile number.";

interface PaymentError {
  code?: string;
  details?: Array<{ field?: string }>;
}

export function paymentFailureMessage(error?: PaymentError): string {
  if (error?.code === "VALIDATION_ERROR") {
    if (error.details?.some((detail) => detail.field === "phone")) return PHONE_VALIDATION_MESSAGE;
    if (error.details?.some((detail) => detail.field === "order")) return "This order cannot be paid through Cashfree. Please contact support.";
    return "Payment details could not be accepted. Please refresh and try again.";
  }
  if (error?.code?.endsWith("_CONFIGURATION_ERROR")) return "Secure checkout is temporarily unavailable. Please contact support.";
  if (error?.code?.startsWith("CASHFREE_")) return "Cashfree is temporarily unavailable. Please try again later.";
  return "The payment page could not be opened. Please try again.";
}
