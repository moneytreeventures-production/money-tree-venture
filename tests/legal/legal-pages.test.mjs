import assert from "node:assert/strict";
import { access, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const root = process.cwd();
const pages = {
  about: ["src/app/about/page.tsx", "Learn More. Explore More. Grow More."],
  contact: ["src/app/contact/page.tsx", "Contact Us"],
  privacy: ["src/app/privacy-policy/page.tsx", "Privacy Policy"],
  terms: ["src/app/terms/page.tsx", "Terms & Conditions"],
  refund: ["src/app/refund-policy/page.tsx", "Refund & Cancellation Policy"],
  billing: ["src/app/billing-information/page.tsx", "Billing Information"],
  shipping: ["src/app/shipping-delivery/page.tsx", "Shipping & Delivery Policy"],
};

async function source(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

test("all seven distinct public information routes exist with page headings and metadata", async () => {
  const routeDirs = (await readdir(path.join(root, "src/app"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && ["about", "contact", "privacy-policy", "terms", "refund-policy", "billing-information", "shipping-delivery"].includes(entry.name));
  assert.equal(routeDirs.length, 7);
  for (const [routeName, [file, heading]] of Object.entries(pages)) {
    const text = await source(file);
    assert.match(text, /export const metadata/ , `${routeName} metadata`);
    assert.ok(text.includes(heading), `${routeName} heading`);
  }
  const billingRoutes = (await readdir(path.join(root, "src/app"))).filter((name) => ["billing", "billing-information"].includes(name));
  assert.deepEqual(billingRoutes, ["billing-information"]);
});

test("footer links every required public page and uses the existing support route", async () => {
  const footer = await source("src/components/layout/footer.tsx");
  for (const href of ["/about", "/contact", "/privacy-policy", "/terms", "/refund-policy", "/billing-information", "/shipping-delivery", "/products"]) {
    assert.ok(footer.includes(`"${href}"`), `footer should link ${href}`);
  }
  const contact = await source(pages.contact[0]);
  assert.ok(contact.includes("ContactForm"));
  assert.ok(contact.includes("mailto:help@moneytreeventure.com"));
  assert.ok(contact.includes("tel:+919820662489"));
  assert.ok(contact.includes("https://wa.me/919820662489"));
  assert.ok(contact.includes("grievance officer’s name"));
  assert.match(footer, /aria-label=\{title\}/);
  assert.match(footer, /sm:grid-cols-2/);
  assert.match(contact, /sm:grid-cols-2/);
  const form = await source("src/components/pages/contact-form.tsx");
  assert.match(form, /<label/);
  assert.match(form, /type="checkbox" name="acknowledged" required/);
  assert.doesNotMatch(form, /name="acknowledged"[^>]*checked/);
});

test("internal links used by public information pages resolve to existing routes and anchors", async () => {
  const files = [...Object.values(pages).map(([file]) => file), "src/components/layout/footer.tsx", "src/components/pages/public-info-page.tsx"];
  const combined = (await Promise.all(files.map(source))).join("\n");
  const hrefs = [...combined.matchAll(/href="(\/[^"]*)"/g)].map((match) => match[1]);
  for (const href of new Set(hrefs)) {
    const [pathname, anchor] = href.split("#");
    const routeFile = pathname === "/" ? "src/app/page.tsx" : `src/app${pathname}/page.tsx`;
    assert.ok(await stat(path.join(root, routeFile)), `route exists for ${href}`);
    if (anchor) {
      let route = await source(routeFile);
      if (pathname === "/account") {
        route += await source("src/components/account/order-history.tsx");
        route += await source("src/components/account/account-resources.tsx");
      }
      assert.match(route, new RegExp(`id=[\"']${anchor}[\"']`), `anchor exists for ${href}`);
    }
  }
});

test("public legal pages use English, fix the privacy email, and do not invent GST or refund promises", async () => {
  const texts = await Promise.all(Object.values(pages).map(([file]) => source(file)));
  const all = texts.join("\n");
  assert.doesNotMatch(all, /hep@moneytreeventure\.com|\bNamaste\b|\bAapki\b|\bYeh\b|\bjaankari\b/i);
  assert.doesNotMatch(all, /no refunds under any circumstances|all sales are final/i);
  assert.doesNotMatch(all, /[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]/);
  assert.match(await source(pages.billing[0]), /No GST tax invoice is issued/);
  assert.match(all, /not guaranteed|not a guarantee/i);
  assert.match(all, /not a PDF download|not a downloadable PDF/i);
  assert.ok(all.includes("help@moneytreeventure.com"));
});

test("authenticated order view remains a summary and secure PDF delivery stays distinct", async () => {
  const history = await source("src/components/account/order-history.tsx");
  const orderService = await source("src/lib/checkout/order-service.ts");
  const downloadService = await source("src/lib/fulfillment/download-service.ts");
  assert.match(history, /These authenticated order summaries are not GST tax invoices/);
  assert.match(orderService, /OrderModel\.findOne\(\{ _id: id, userId \}\)/);
  assert.match(orderService, /OrderModel\.find\(\{ userId, \$nor:/);
  assert.match(orderService, /lines\.map/);
  assert.doesNotMatch(history, /receipt download|GST invoice download/i);
  await assert.rejects(access(path.join(root, "src/app/api/orders/[id]/receipt/route.ts")));
  assert.match(downloadService, /ownedActiveDownloadPurchaseFilter/);
  assert.match(downloadService, /getPrivatePdf/);
  assert.doesNotMatch(await source(pages.shipping[0]), /r2\.dev|cloudflarestorage\.com|signedurl/i);
});

test("billing page blocks receipts pending tax review without changing historical order snapshots", async () => {
  const billing = await source(pages.billing[0]);
  const schema = await source("src/lib/db/models/order.ts");
  const config = await source("src/lib/checkout/order-service.ts");
  assert.match(billing, /production launch blocker/i);
  assert.match(billing, /not being issued/i);
  assert.match(schema, /taxPaise: \{ \.\.\.paise, default: 0, immutable: true \}/);
  assert.match(schema, /taxSnapshot/);
  assert.match(schema, /subtotalPaise: \{ \.\.\.paise, immutable: true \}/);
  assert.match(schema, /currency: \{ type: String, enum: \["INR"\], default: "INR", required: true, immutable: true \}/);
  assert.match(config, /TAX_RATE_BPS/);
  assert.ok(await stat(path.join(root, "src/app/account/page.tsx")));
});
