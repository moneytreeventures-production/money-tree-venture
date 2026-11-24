/** Keep Indian mobile numbers as strings; allow spacing and common separators. */
export function normalizeIndianMobilePhone(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const phone = input.trim().replace(/[\s()+-]/g, "");
  return /^[6-9]\d{9}$/.test(phone) ? phone : null;
}
