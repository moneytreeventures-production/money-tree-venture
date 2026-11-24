/** Copies are generated on demand by the authenticated download endpoint. */
export function pdfDownloadButtonLabel(name: string, status: "pending" | "ready" | "failed", downloading: boolean): string {
  if (downloading) return `Preparing ${name}…`;
  if (status === "failed") return `Retry ${name} download`;
  return `Download ${name}`;
}
