import Link from "next/link";
import { PendingLink } from "@/components/pending-link";
import { Logo, LogoMark } from "@/components/brand";
import { LandingFX } from "./landing-fx";
import { PhoneShowcase } from "./phone-showcase";
import { LiveStats } from "./live-stats";
import { Contact } from "./contact";
import { ThemeToggle } from "@/components/theme-toggle";
import { LEGAL } from "@/lib/legal";

// Regenerate hourly so the live counts stay fresh without making every
// visitor wait on a database round-trip.
export const revalidate = 3600;

/* ---------- inline icons ---------- */
function Ico({ d, className = "h-6 w-6" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={d} />
    </svg>
  );
}
const P = {
  qr: "M4 7V5a1 1 0 0 1 1-1h2M4 17v2a1 1 0 0 0 1 1h2M20 7V5a1 1 0 0 0-1-1h-2M20 17v2a1 1 0 0 1-1 1h-2M4 12h16",
  repeat: "M17 2l4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3",
  chart: "M3 3v18h18M8 17V10M13 17V6M18 17v-4",
  pin: "M12 21s-7-6.5-7-11a7 7 0 1 1 14 0c0 4.5-7 11-7 11ZM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  menu: "M4 6h16M4 12h16M4 18h16",
  gift: "M20 12v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8M2 7h20v5H2zM12 21V7M12 7S11 3 8.5 3 6 5 6 5s.5 2 3 2M12 7s1-4 3.5-4S18 5 18 5s-.5 2-3 2",
  stand: "M4 4h16v10H4zM12 14v6M8 20h8",
  check: "M20 6 9 17l-5-5",
};

const FEATURES = [
  { icon: P.qr, title: "One QR code", body: "Print one QR. Customers scan and stamps collect automatically — no app to download." },
  { icon: P.repeat, title: "More repeat visits", body: "Customers come back to complete their card and claim rewards. Loyalty made effortless." },
  { icon: P.chart, title: "Real-time insights", body: "Daily scans, active customers, redemption rate and trends — all in one dashboard." },
  { icon: P.pin, title: "Multi-branch & geofence", body: "One QR across locations, with GPS scan verification so stamps only count at your store." },
  { icon: P.menu, title: "AI digital menu", body: "The same QR opens your full menu — write item descriptions by hand or generate with AI." },
  { icon: P.gift, title: "Scratch cards", body: "Surprise 'scratch & win' bonuses on some visits keep customers coming back for more." },
];

const STEPS = [
  { n: 1, title: "Register your business", body: "Sign up, set your reward (e.g. 10 visits = free coffee), add your logo." },
  { n: 2, title: "Display your QR code", body: "Download and print your branded QR, or add it to your counter." },
  { n: 3, title: "Watch customers return", body: "Track scans, repeat rate and claimed rewards — all from your dashboard." },
];

// Prices carry the currency in the label, not just in a line above the grid —
// a Canadian shop comparing tools shouldn't have to guess whether "$20" is USD.
const PLANS = [
  { name: "Monthly", price: "$20", per: "CAD / month", features: ["All features included", "Unlimited scans", "First 3 days free"], popular: false, cta: "Get started" },
  { name: "Yearly", price: "$150", per: "CAD / year", features: ["Everything in Monthly", "Save $90 CAD a year", "First 3 days free"], popular: true, cta: "Get started" },
  { name: "Lifetime", price: "$250", per: "CAD one-time", features: ["Pay once, use forever", "All features included", "Refundable for 14 days"], popular: false, cta: "Get started" },
];

const FAQS = [
  { q: "How does it work for my business?", a: "Sign up, set your reward, and display your QR code. Customers scan it each visit to collect stamps. You track everything from your dashboard." },
  { q: "Do customers need to download an app?", a: "No. They scan your QR with their phone camera and it opens a web page — nothing to install." },
  { q: "Is there a free trial?", a: "Monthly and Yearly start with a 3-day free trial. A card is required to begin, nothing is charged during those 3 days, and the plan then renews automatically at the plan price unless you cancel. Cancel before the trial ends from Settings → Subscription and you pay nothing. Lifetime is a single payment with no trial." },
  { q: "Why do you need my card for a free trial?", a: "So your program keeps running the moment the trial ends — no dead QR code on your counter. Your card is entered on Stripe's checkout page and stored by Stripe, never by us. Cancel before day 3 from Settings → Subscription and you pay nothing." },
  { q: "Which payment methods do you accept?", a: "Card, Apple Pay and Google Pay — all handled by Stripe. On a phone that already has Apple Pay or Google Pay set up, the option appears at checkout on its own. Your card details go straight to Stripe; wscanner never sees or stores them. All prices are in Canadian dollars." },
  { q: "Can I use one QR code for multiple branches?", a: "Yes. One QR works across all your locations, with optional GPS verification so stamps only count at your store." },
];

export default function Home() {
  return (
    <div className="bg-card text-ink">
      {/* nav */}
      <header className="sticky top-0 z-30 border-b border-line-soft bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <Logo />
          <nav className="hidden items-center gap-6 text-sm font-medium text-body sm:flex">
            <a href="#features" className="hover:text-ink">Features</a>
            <a href="#how" className="hover:text-ink">How it works</a>
            <a href="#pricing" className="hover:text-ink">Pricing</a>
            <a href="#contact" className="hover:text-ink">Contact</a>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <PendingLink href="/login" spinner="h-4 w-4" className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-body hover:bg-elev sm:block">
              Business sign in
            </PendingLink>
            <PendingLink href="/login" spinner="h-4 w-4" className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-ink">
              Get started
            </PendingLink>
          </div>
        </div>
      </header>

      {/* hero */}
      {/* overflow-hidden keeps the card's glow (.aura spreads 18% past its box)
          from widening the page on a narrow screen */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 overflow-hidden px-5 py-16 lg:grid-cols-2 lg:py-24">
        {/* centred on a phone, left-aligned once the two-column layout kicks in */}
        <div className="text-center lg:text-left">
          <span className="font-mono text-xs font-semibold uppercase tracking-widest text-accent">
            wscanner · Canada 🍁
          </span>
          <h1 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            Turn every visit into a <span className="text-accent">repeat customer.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-md text-lg text-body lg:mx-0">
            Digital loyalty stamp cards for cafés, salons, gyms &amp; more. Customers scan one QR code —
            no app to download.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3 lg:justify-start">
            <PendingLink
              href="/login"
              className="group inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-3 font-semibold text-white transition hover:bg-brand-ink"
            >
              Get started
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
                strokeLinecap="round" strokeLinejoin="round"
                className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden>
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </PendingLink>
            <a href="#how" className="rounded-xl border border-line-strong px-6 py-3 font-semibold text-body hover:bg-app">
              See how it works
            </a>
          </div>
          <p className="mt-4 text-sm text-muted">3 days free · Card required to start · Cancel any time</p>
        </div>

        {/* mock card */}
        <div id="hero-card-wrap" className="aura floaty relative mx-auto w-full max-w-sm" style={{ perspective: "1000px" }}>
          <div className="absolute -right-3 -top-3 z-10 rotate-6 rounded-xl bg-ok-solid px-3 py-1.5 text-sm font-bold text-white shadow-lg">
            +1 Stamp ⭐
          </div>
          <div id="hero-card" className="tilt rounded-3xl border border-line bg-card p-6 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-xl font-bold text-white">M</div>
              <div>
                <div className="font-bold">Maple Café</div>
                <div className="text-xs uppercase tracking-widest text-accent">Premium partner ✓</div>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <div className="text-lg font-bold">7 of 10 Stamps</div>
              <span className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent">✦ 70 XP</span>
            </div>
            <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-elev">
              <div className="h-full rounded-full bg-brand" style={{ width: "70%" }} />
            </div>
            <div className="mt-5 grid grid-cols-5 gap-2">
              {Array.from({ length: 10 }, (_, i) => (
                <div key={i} className={`flex aspect-square items-center justify-center rounded-full border text-sm font-bold ${i < 7 ? "border-brand bg-brand text-white" : "border-dashed border-line-strong text-faint"}`}>
                  {i < 7 ? "★" : i === 9 ? "🎁" : i + 1}
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-xl bg-app p-3 text-center text-sm text-body">
              3 more stamps until <strong>Free Coffee</strong> ☕
            </div>
          </div>
        </div>
      </section>

      <PhoneShowcase />

      {/* trust band — real counts once there are enough of them */}
      <LiveStats />

      {/* features */}
      <section id="features" className="mx-auto max-w-6xl px-5 py-16 lg:py-24">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold tracking-tight">Everything you need to boost repeat customers</h2>
          <p className="mx-auto mt-3 max-w-xl text-body">One simple platform — from the QR on your counter to the insights on your dashboard.</p>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <div key={f.title} style={{ transitionDelay: `${i * 70}ms` }} className="reveal rounded-2xl border border-line bg-card p-6 transition-shadow duration-300 hover:shadow-lg">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <Ico d={f.icon} />
              </div>
              <h3 className="mt-4 font-bold">{f.title}</h3>
              <p className="mt-1 text-sm text-body">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* how it works */}
      <section id="how" className="border-y border-line-soft bg-app">
        <div className="mx-auto max-w-6xl px-5 py-16 lg:py-24">
          <div className="text-center">
            <h2 className="text-3xl font-extrabold tracking-tight">Go live in 3 steps</h2>
            <p className="mx-auto mt-3 max-w-xl text-body">No hardware, no setup fees. Start rewarding customers today.</p>
          </div>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <div key={s.n} style={{ transitionDelay: `${i * 90}ms` }} className="reveal rounded-2xl bg-card p-6 shadow-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-lg font-bold text-white">{s.n}</div>
                <h3 className="mt-4 font-bold">{s.title}</h3>
                <p className="mt-1 text-sm text-body">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* pricing */}
      <section id="pricing" className="mx-auto max-w-6xl px-5 py-16 lg:py-24">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold tracking-tight">Simple, transparent pricing</h2>
          <p className="mt-2 text-sm font-semibold uppercase tracking-wide text-accent">
            Prices in Canadian dollars (CAD)
          </p>
          <p className="mx-auto mt-3 max-w-xl text-body">
            3-day free trial on Monthly and Yearly. Card required, charged only when the trial ends.
          </p>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {PLANS.map((p, i) => (
            <div key={p.name} style={{ transitionDelay: `${i * 90}ms` }} className={`reveal relative rounded-2xl border bg-card p-6 transition-shadow duration-300 hover:shadow-xl ${p.popular ? "border-brand shadow-lg ring-1 ring-brand" : "border-line"}`}>
              {p.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
                  Most popular
                </span>
              )}
              <div className="font-semibold text-muted">{p.name}</div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-4xl font-extrabold tracking-tight">{p.price}</span>
                <span className="text-muted">{p.per}</span>
              </div>
              <ul className="mt-5 space-y-2 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-body">
                    <span className="text-accent"><Ico d={P.check} className="h-4 w-4" /></span>
                    {f}
                  </li>
                ))}
              </ul>
              <PendingLink
                href="/login"
                className={`mt-6 block rounded-xl px-4 py-2.5 text-center font-semibold ${p.popular ? "bg-brand text-white hover:bg-brand-ink" : "border border-line-strong text-body hover:bg-app"}`}
              >
                {p.cta}
              </PendingLink>
            </div>
          ))}
        </div>

        <p className="mt-6 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-sm text-muted">
          <span>Pay by card, Apple&nbsp;Pay or Google&nbsp;Pay</span>
          <span aria-hidden>·</span>
          <span>Secured by Stripe</span>
        </p>
      </section>

      {/* FAQ */}
      <section className="border-t border-line-soft bg-app">
        <div className="mx-auto max-w-3xl px-5 py-16 lg:py-20">
          <h2 className="text-center text-3xl font-extrabold tracking-tight">Frequently asked questions</h2>
          <div className="mt-8 space-y-3">
            {FAQS.map((f) => (
              <details key={f.q} className="group rounded-2xl border border-line bg-card p-4">
                <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
                  {f.q}
                  <span className="text-faint transition group-open:rotate-45">＋</span>
                </summary>
                <p className="mt-2 text-sm text-body">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* final CTA */}
      <section className="mx-auto max-w-5xl px-5 py-16">
        <div className="reveal rounded-3xl bg-gradient-to-br from-brand to-brand-ink p-10 text-center text-white">
          <h2 className="text-3xl font-extrabold tracking-tight">Ready to grow your repeat customers?</h2>
          <p className="mx-auto mt-3 max-w-md text-white/80">Set up your loyalty program in minutes. No app, no hardware, 3 days free.</p>
          <PendingLink
            href="/login"
            className="group mt-6 inline-flex items-center gap-2 rounded-xl bg-card px-6 py-3 font-semibold text-accent transition hover:bg-elev"
          >
            Get started
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
              strokeLinecap="round" strokeLinejoin="round"
              className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </PendingLink>
        </div>
      </section>

      <Contact />

      {/* footer */}
      <footer className="border-t border-line-soft">
        <div className="mx-auto max-w-6xl px-5 py-12 text-center">
          <LogoMark className="mx-auto h-14 w-14" />

          <nav className="mt-7 flex flex-wrap items-center justify-center gap-x-7 gap-y-3 text-sm text-muted">
            <Link href="/terms" className="hover:text-body">Terms &amp; Conditions</Link>
            <Link href="/privacy" className="hover:text-body">Privacy Policy</Link>
            <Link href="/refund" className="hover:text-body">Refund Policy</Link>
            <a href="#contact" className="hover:text-body">Contact</a>
          </nav>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted">
            <a href={`mailto:${LEGAL.email}`} className="hover:text-body">
              {LEGAL.email}
            </a>
            <a
              href={`tel:${LEGAL.phone.replace(/[^\d+]/g, "")}`}
              className="whitespace-nowrap hover:text-body"
            >
              {LEGAL.phone}
            </a>
          </div>

          <p className="mt-5 text-sm text-faint">
            © {new Date().getFullYear()} wscanner · Built for Canadian businesses 🍁
          </p>
        </div>
      </footer>

      <LandingFX />
    </div>
  );
}
