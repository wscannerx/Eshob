// =============================================================================
// scripts/stripe-setup.mjs
// Creates the Eshop products & prices in your Stripe account, then prints the
// price IDs to paste into .env.local. Safe to re-run: it reuses products it
// already made (matched by a metadata tag) instead of creating duplicates.
//
// Usage:
//   1. Put STRIPE_SECRET_KEY in .env.local (test key: sk_test_...)
//   2. node scripts/stripe-setup.mjs
//   3. Copy the three STRIPE_PRICE_* lines it prints into .env.local
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import Stripe from "stripe";

// --- load STRIPE_SECRET_KEY from .env.local (no extra deps) ------------------
function loadEnv() {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}
loadEnv();

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("\n✗ STRIPE_SECRET_KEY not found. Add it to .env.local first (sk_test_...).\n");
  process.exit(1);
}
const stripe = new Stripe(key);
const CURRENCY = "cad"; // Canada

// One product per plan.
//
// `name` is CUSTOMER-FACING: it shows on Stripe's checkout page, on the emailed
// receipt, and on the card statement. Keep it the brand name, not the repo name.
//
// `tag` is internal and must NEVER change — it's the metadata key this script
// matches on to find products it already made, so renaming a tag would create a
// duplicate product instead of reusing the existing one.
const PRODUCTS = [
  {
    tag: "eshop_monthly",
    name: "wscanner — Monthly",
    envVar: "STRIPE_PRICE_MONTHLY",
    price: { unit_amount: 2000, recurring: { interval: "month" } }, // $20/mo
  },
  {
    tag: "eshop_yearly",
    name: "wscanner — Yearly",
    envVar: "STRIPE_PRICE_YEARLY",
    price: { unit_amount: 15000, recurring: { interval: "year" } }, // $150/yr
  },
  {
    tag: "eshop_lifetime",
    name: "wscanner — Lifetime",
    envVar: "STRIPE_PRICE_LIFETIME",
    price: { unit_amount: 25000 }, // $250 one-time
  },
];

async function findProduct(tag) {
  // search API isn't on every account; fall back to listing.
  try {
    const r = await stripe.products.search({ query: `metadata['eshop_tag']:'${tag}'`, limit: 1 });
    if (r.data[0]) return r.data[0];
  } catch {
    /* search not enabled — fall through */
  }
  for await (const p of stripe.products.list({ limit: 100 })) {
    if (p.metadata?.eshop_tag === tag) return p;
  }
  return null;
}

async function priceForProduct(product, wanted) {
  for await (const pr of stripe.prices.list({ product: product.id, active: true, limit: 100 })) {
    const sameAmount = pr.unit_amount === wanted.unit_amount && pr.currency === CURRENCY;
    const sameInterval =
      (pr.recurring?.interval ?? null) === (wanted.recurring?.interval ?? null);
    if (sameAmount && sameInterval) return pr;
  }
  return null;
}

const results = {};

for (const def of PRODUCTS) {
  let product = await findProduct(def.tag);
  if (product) {
    console.log(`• Reusing product "${def.name}" (${product.id})`);
  } else {
    product = await stripe.products.create({ name: def.name, metadata: { eshop_tag: def.tag } });
    console.log(`✓ Created product "${def.name}" (${product.id})`);
  }

  let price = await priceForProduct(product, def.price);
  if (price) {
    console.log(`  • Reusing price ${price.id}`);
  } else {
    price = await stripe.prices.create({
      product: product.id,
      currency: CURRENCY,
      ...def.price,
    });
    console.log(`  ✓ Created price ${price.id}`);
  }
  results[def.envVar] = price.id;
}

// --- compare against whatever is currently configured -----------------------
const stale = Object.entries(results).filter(([k, v]) => process.env[k] && process.env[k] !== v);
const missing = Object.keys(results).filter((k) => !process.env[k]);

console.log("\n=============================================================");
console.log(" Paste these into your .env.local (then restart `npm run dev`):");
console.log("=============================================================\n");
for (const [k, v] of Object.entries(results)) console.log(`${k}=${v}`);
console.log("");

if (missing.length) {
  console.log(`⚠  Not set yet: ${missing.join(", ")}`);
}
if (stale.length) {
  console.log("⚠  These are set to something else — checkout will fail with");
  console.log("   \"No such price\" until you replace them:\n");
  for (const [k, v] of stale) {
    console.log(`   ${k}`);
    console.log(`     now: ${process.env[k]}`);
    console.log(`     should be: ${v}`);
  }
  console.log("\n   Remember to update these in Vercel too, then redeploy.\n");
}
if (!missing.length && !stale.length) {
  console.log("✓ Your current env matches Stripe — nothing to change.\n");
}
