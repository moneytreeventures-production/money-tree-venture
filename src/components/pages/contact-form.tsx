"use client";
import { useState } from "react";
const categories = [
  ["general","General enquiry"],["product","Product question"],["order","Order or payment support"],
  ["download","Download or access problem"],["booking","Consultation booking support"],
  ["grievance","Complaint or grievance"],["other","Other"],
];
export function ContactForm() {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [reference, setReference] = useState("");
  const [fields, setFields] = useState<string[]>([]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setFeedback(""); setFields([]); setReference("");
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    try {
      const response = await fetch("/api/support", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...values, acknowledged: values.acknowledged === "on" }) });
      const result = await response.json();
      if (response.ok) { setReference(result.reference); form.reset(); }
      else { setFeedback(result.error); setFields(result.fields ?? []); }
    } catch { setFeedback("Your request could not be saved. Please try again."); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="mt-8 grid max-w-2xl gap-5">
    <label className="grid gap-2">Name<input name="name" required minLength={2} maxLength={100} autoComplete="name" className="min-h-11 rounded-lg border border-border bg-background px-3" />{fields.includes("name") && <small role="alert">Enter your name.</small>}</label>
    <label className="grid gap-2">Email<input name="email" type="email" required maxLength={320} autoComplete="email" className="min-h-11 rounded-lg border border-border bg-background px-3" />{fields.includes("email") && <small role="alert">Enter a valid email.</small>}</label>
    <label className="grid gap-2">Category<select name="category" required className="min-h-11 rounded-lg border border-border bg-background px-3">{categories.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label className="grid gap-2">Subject<input name="subject" required minLength={3} maxLength={160} className="min-h-11 rounded-lg border border-border bg-background px-3" />{fields.includes("subject") && <small role="alert">Enter a subject.</small>}</label>
    <label className="grid gap-2">Message<textarea name="message" required minLength={10} maxLength={5000} rows={6} className="rounded-lg border border-border bg-background p-3" />{fields.includes("message") && <small role="alert">Enter a message of 10 - 5000 characters.</small>}</label>
    <p className="text-sm text-foreground-secondary">Do not include passwords, payment-card details or authentication codes. We use these details to handle your enquiry.</p>
    <label className="flex gap-2"><input type="checkbox" name="acknowledged" required /> I understand my contact details and message will be stored to respond to this request.</label>
    <button disabled={busy} className="min-h-12 rounded-full bg-accent px-6 font-semibold text-[#0f1e36] focus-visible:outline-2 focus-visible:outline-accent">{busy ? "Submitting..." : "Send enquiry"}</button>
    <p role="status" aria-live="polite">{reference ? "Your request was received. Reference: " + reference : feedback}</p>
  </form>;
}
