import { Suspense } from "react";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { EmailTestingPanel } from "@/components/admin/email-testing-panel";

export default function Page() {
  return <Suspense fallback={<main className="mx-auto max-w-3xl p-6" role="status">Loading email testing…</main>}><ProtectedPanel /></Suspense>;
}

async function ProtectedPanel() {
  await connection();
  await requireAdmin();
  return <EmailTestingPanel />;
}
