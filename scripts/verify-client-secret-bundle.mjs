import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import nextEnv from "@next/env";

const { combinedEnv } = nextEnv.loadEnvConfig(process.cwd(), false);
const staticRoot = join(process.cwd(), ".next", "static");
const assets = [];

function collectAssets(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collectAssets(path);
    else if (entry.isFile()) assets.push(path);
  }
}

try {
  collectAssets(staticRoot);
} catch {
  console.error("Client bundle is missing. Run npm run build before the secret scan.");
  process.exit(1);
}

if (assets.length === 0) {
  console.error("No client assets were found under .next/static.");
  process.exit(1);
}

const bundle = Buffer.concat(assets.map((path) => readFileSync(path)));
const credentials = Object.entries(combinedEnv).filter(([name, value]) =>
  /SECRET|PASSWORD|TOKEN|PRIVATE_KEY|ACCESS_KEY|API_KEY|MONGODB_URI|DATABASE_URL/i.test(name) &&
  typeof value === "string" &&
  value.length >= 8,
);
const leakedNames = credentials
  .filter(([, value]) => bundle.includes(Buffer.from(value, "utf8")))
  .map(([name]) => name);

console.info("Scanned " + assets.length + " client assets against " + credentials.length + " configured secret-like values.");
if (leakedNames.length > 0) {
  console.error("Possible secret values found in client assets for: " + leakedNames.join(", "));
  process.exit(1);
}
console.info("No configured secret-like values were found in the client bundle.");
