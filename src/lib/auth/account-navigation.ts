export interface AccountNavigationDecision {
  label: "Account" | "Admin Panel";
  href: "/account" | "/admin";
}

/** Only a server-confirmed owner decision can change the account destination. */
export function getAccountNavigationDecision(isAuthorizedAdmin: boolean): AccountNavigationDecision {
  return isAuthorizedAdmin
    ? { label: "Admin Panel", href: "/admin" }
    : { label: "Account", href: "/account" };
}
