/**
 * The single source of truth for the business's own details.
 *
 * Read by the Terms / Privacy / Refund pages, the landing-page footer and the
 * contact block — so changing a value here changes it everywhere. Don't copy
 * any of it into a component: that is how the support phone ended up different
 * in three places.
 *
 * These values are filled in and live. The wording of the legal pages is a
 * careful starting point written around how this app actually works, but it is
 * not legal advice — worth a lawyer's eye before the business scales.
 */
export const LEGAL = {
  /** Trading name shown to customers. */
  brand: "wscanner",
  /**
   * The legal entity behind the service. A sole proprietor trading under their
   * own name IS the business, so this is a person, not a company.
   */
  legalName: "Fahim Muktadir Mahbub",
  /** Where you're registered — sets which courts and laws apply. */
  province: "British Columbia",
  country: "Canada",
  /** Business mailing address. */
  address: "7705 112 St, Delta, BC V4C 4V9",
  email: "support@wscanner.ca",
  /**
   * Must match the support phone on the Stripe account (Settings → Business →
   * Public details). A customer who sees one number on a receipt and another on
   * the Terms page has no way to tell which one reaches a human.
   */
  phone: "+1 (437) 345-9628",
  /**
   * PIPEDA requires a named individual accountable for personal information —
   * a role alone isn't enough. Put the owner's real name here.
   */
  privacyOfficer: "Fahim Muktadir Mahbub",
  /** Bump this whenever you change the wording. */
  updated: "20 September 2026",
} as const;

/**
 * Set to true ONLY once the business is actually registered for GST/HST.
 * Charging or advertising tax without a number is an offence, so this stays
 * false until the owner confirms registration — then flip it and the "+ tax"
 * wording appears wherever prices are shown.
 */
export const TAX_REGISTERED = false;

export const PLANS_SUMMARY = [
  { name: "Monthly", price: "$20 CAD / month" },
  { name: "Yearly", price: "$150 CAD / year" },
  { name: "Lifetime", price: "$250 CAD one-time" },
];
