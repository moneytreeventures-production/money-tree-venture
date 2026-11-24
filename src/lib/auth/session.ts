import "server-only";

import { headers } from "next/headers";
import { AuthorizationError, AuthenticationError } from "../errors/app-error";
import { getAuth } from "./auth";
import { provisionCustomerProfile, type AuthenticatedIdentity } from "./customer-profile";
import type { User } from "../db/models/user";

type AuthInstance = Awaited<ReturnType<typeof getAuth>>;
export type AuthSession = Awaited<ReturnType<AuthInstance["api"]["getSession"]>>;

export function createCustomerSessionUtilities(
  readSession: () => Promise<AuthSession>,
  provisionProfile: (identity: AuthenticatedIdentity) => Promise<User>,
) {
  async function getCurrentSession(): Promise<AuthSession> {
    return readSession();
  }

  async function getCurrentApplicationProfile(): Promise<User | null> {
    const session = await readSession();
    if (!session) return null;

    return provisionProfile({
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
    });
  }

  async function getCurrentCustomer(): Promise<User | null> {
    const customer = await getCurrentApplicationProfile();
    if (!customer) return null;

    if (customer.role !== "customer" || customer.status !== "active") throw new AuthorizationError();
    return customer;
  }

  async function requireCustomer(): Promise<User> {
    const customer = await getCurrentCustomer();
    if (!customer) throw new AuthenticationError();
    return customer;
  }

  return { getCurrentSession, getCurrentApplicationProfile, getCurrentCustomer, requireCustomer };
}

async function readRequestSession(): Promise<AuthSession> {
  const requestHeaders = await headers();
  const auth = await getAuth();
  return auth.api.getSession({ headers: requestHeaders });
}

const customerSessionUtilities = createCustomerSessionUtilities(
  readRequestSession,
  provisionCustomerProfile,
);

export const getCurrentSession = customerSessionUtilities.getCurrentSession;
export const getCurrentApplicationProfile = customerSessionUtilities.getCurrentApplicationProfile;
export const getCurrentCustomer = customerSessionUtilities.getCurrentCustomer;
export const requireCustomer = customerSessionUtilities.requireCustomer;
