/**
 * App Mode Configuration
 *
 * The same codebase ships as two products:
 *   1. "secret_agent" → my-secret-agent.com (Entry tier app, sentence-form default)
 *   2. "gia"          → www.go-i-agency.com (upgrade destination, Command Center default)
 *
 * Set VITE_APP_MODE in the deployment environment to switch.
 *
 * Both apps share the SAME Supabase backend, SAME auth.users, SAME mission data.
 * Only the default view and tier limits differ.
 */

export type AppMode = 'secret_agent' | 'gia';

const rawMode = (import.meta.env.VITE_APP_MODE ?? 'secret_agent') as AppMode;
export const APP_MODE: AppMode = rawMode === 'gia' ? 'gia' : 'secret_agent';

// ─── Tier configuration ───────────────────────────────────────────────────────

export interface TierConfig {
  id: string;
  label: string;
  /** Monthly price string, e.g. "$4.99/mo" */
  price: string;
  /** Optional annual price string, e.g. "$49.99/yr" */
  priceAnnual?: string;
  /** Optional savings note shown next to annual price, e.g. "2 months free" */
  annualSavingsNote?: string;
  /** Optional trial badge text, e.g. "10 days free" */
  trial?: string;
  /** Optional small note shown below trial badge */
  trialNote?: string;
  /** Short mission-count description, e.g. "3–4 missions" */
  missionsLabel: string;
  /** Short cadence description, e.g. "Hourly checks" */
  interval: string;
  /** Feature bullets shown on landing page pricing card */
  featureBullets?: string[];
  /** One line: how this tier differs from the one below it */
  summary?: string;
  /** True for the tier currently in use (shown in in-app pricing panel) */
  current?: boolean;
  /** Marks the "most popular" tier on the landing page */
  highlight?: boolean;
  /** True if the tier is free / signup-only — CTA opens signup modal instead of Stripe */
  isFree?: boolean;
  /** Stripe payment link for monthly subscription. Replace with your real link before going live. */
  stripeLink?: string;
  /** Stripe payment link for annual subscription. Optional. */
  stripeLinkAnnual?: string;
}

export interface LandingConfig {
  /** Bold marketing headline, max 1–2 lines. */
  headline: string;
  /** Word inside the headline that gets the brand color highlight. */
  headlineHighlight?: string;
  /** Two-sentence description below the headline. */
  description: string;
  /** Hero CTA button label. */
  heroCta: string;
  /** Microcopy under the hero CTA button. */
  heroCtaNote: string;
  /** Pricing section heading. */
  pricingHeading: string;
  /** Pricing section sub-line. */
  pricingSubhead: string;
}

export interface ModeConfig {
  /** Display name for headers/branding */
  name: string;
  /** Tagline shown under the wordmark */
  tagline: string;
  /** Production domain (informational) */
  domain: string;
  /** Which view is the default landing screen */
  defaultView: 'agent' | 'command';
  /** Active mission limit on the entry/default tier */
  missionLimit: number;
  /** Pricing tiers shown in the upgrade panel + landing page */
  tiers: TierConfig[];
  /** Browser tab title */
  documentTitle: string;
  /** Header brand color hint */
  brandAccent: 'amber' | 'emerald';
  /** Marketing landing page copy */
  landing: LandingConfig;
}

// ─── Secret Agent (App 1) ─────────────────────────────────────────────────────

const SECRET_AGENT_CONFIG: ModeConfig = {
  name: 'My Secret Agent',
  tagline: 'Watching silently in the background.',
  domain: 'my-secret-agent.com',
  defaultView: 'agent',
  missionLimit: 4,
  documentTitle: 'My Secret Agent',
  brandAccent: 'amber',
  landing: {
    headline: 'A silent watchman for the things you can\'t watch yourself.',
    headlineHighlight: 'silent watchman',
    description:
      'Set up missions in plain English — weather, sale prices, stock thresholds, news. Your secret agent watches in the background and alerts you the moment something changes.',
    heroCta: 'Start Free — No credit card',
    heroCtaNote: 'Free forever. Upgrade anytime. Cancel anytime.',
    pricingHeading: 'Clearance Levels',
    pricingSubhead: 'Pick a tier when you\'re ready. Trial first, no card required.',
  },
  tiers: [
    {
      id: 'entry',
      label: 'Entry',
      price: '$4.99/mo',
      priceAnnual: '$49.99/yr',
      annualSavingsNote: '2 months free',
      trial: '10 days free',
      trialNote: 'No credit card — just an email to start.',
      missionsLabel: '3–4 missions',
      interval: 'Hourly checks',
      current: true,
      isFree: true, // CTA opens signup modal — Stripe charges only after trial ends
      featureBullets: [
        'Up to 4 active missions',
        'Hourly checks',
        'Push notifications to any device',
        'Email support',
      ],
      stripeLink: 'https://buy.stripe.com/REPLACE_WITH_ENTRY_MONTHLY_LINK',
      stripeLinkAnnual: 'https://buy.stripe.com/REPLACE_WITH_ENTRY_ANNUAL_LINK',
    },
    {
      id: 'agent',
      label: 'Agent',
      price: '$14.99/mo',
      priceAnnual: '$149.99/yr',
      annualSavingsNote: '2 months free',
      missionsLabel: 'Unlimited missions',
      interval: 'Hourly checks',
      highlight: true,
      featureBullets: [
        'Unlimited missions',
        'Hourly checks',
        'Push + email notifications',
        'Priority support',
      ],
      stripeLink: 'https://buy.stripe.com/REPLACE_WITH_AGENT_MONTHLY_LINK',
      stripeLinkAnnual: 'https://buy.stripe.com/REPLACE_WITH_AGENT_ANNUAL_LINK',
    },
    {
      id: 'agency',
      label: 'Agency',
      price: '$29.99/mo',
      priceAnnual: '$299.99/yr',
      annualSavingsNote: '2 months free',
      missionsLabel: 'Unlimited + advanced',
      interval: 'Priority checks',
      featureBullets: [
        'Unlimited missions',
        'Priority hourly checks',
        'Push notifications & email alerts',
        'Advanced filters & rules',
        'Premium support',
      ],
      stripeLink: 'https://buy.stripe.com/REPLACE_WITH_AGENCY_MONTHLY_LINK',
      stripeLinkAnnual: 'https://buy.stripe.com/REPLACE_WITH_AGENCY_ANNUAL_LINK',
    },
  ],
};

// ─── GIA — Go Intelligence Agency (App 2) ────────────────────────────────────
//
// Positioned for serious operators: traders, founders, executives, consultants.
// "The intelligence platform that doesn't require an IT department."
//
// Three tiers:
//   Operative — 30-day free trial, 5 operatives (missions) to prove the value
//   Director  — $19.99/mo, 4 intelligence portfolios (≈20 missions), deep coverage
//   Agency    — $49.99/mo, unlimited, morning briefings, full operation

const GIA_CONFIG: ModeConfig = {
  name: 'Go Intelligence Agency',
  tagline: 'Intel. When you need it.',
  domain: 'www.go-i-agency.com',
  defaultView: 'command',
  missionLimit: Infinity,
  documentTitle: 'GIA — Your Operations Hub',
  brandAccent: 'emerald',
  landing: {
    headline: 'Your personal intelligence agency.',
    headlineHighlight: 'intelligence agency',
    description:
      'You already juggle pages — a competitor, a restock, the weather, Friday’s score. Drop them here. GIA checks them every hour and pings you when something moves. No stack. No IT. Just the cute name, then an easy jump in.',
    heroCta: 'Start your free trial — 30 days',
    heroCtaNote: 'No credit card. Starts immediately. Email only if you save it for another device.',
    pricingHeading: 'How the desk grows',
    pricingSubhead: 'Same hub at every level. What changes is how much of the board you can run.',
  },
  tiers: [
    {
      id: 'operative',
      label: 'Operative',
      price: '$9.99/mo',
      priceAnnual: '$99.99/yr',
      annualSavingsNote: '2 months free',
      trial: '30 days',
      trialNote: 'No credit card. Starts immediately. Email only if you sign up to keep it on another device.',
      missionsLabel: '5 active operatives',
      interval: 'Hourly checks',
      current: true,
      // Start with signup only — no Stripe until after the 30-day trial
      isFree: true,
      summary: 'Start the desk. Five operatives, one hub, hourly checks.',
      featureBullets: [
        '5 active operatives on the board',
        'Operations Hub — every signal in one place',
        'Hourly checks across markets, pages, news, weather, scores',
        'Ping this device when something moves',
        '30-day trial — no card',
      ],
      // Kept for post-trial / renew flows — landing CTA must not open these during trial start
      stripeLink: 'https://buy.stripe.com/5kQcN6bOxfue15wfCleME0q',
      stripeLinkAnnual: 'https://buy.stripe.com/14AeVe8Cl2Hs01scq9eME0p',
    },
    {
      id: 'director',
      label: 'Director',
      price: '$19.99/mo',
      priceAnnual: '$199.99/yr',
      annualSavingsNote: '2 months free',
      missionsLabel: '4 intelligence portfolios',
      interval: 'Hourly checks',
      highlight: true,
      summary: 'Run books. Four portfolios, twenty operatives.',
      featureBullets: [
        '4 portfolios (market book, competitor book, sports book…)',
        'Up to 20 operatives across those books',
        'Same hub — more coverage on the board',
        'Hourly checks and device pings',
        'Priority support',
      ],
      stripeLink: 'https://buy.stripe.com/bJe14o05P95Q9C289TeME0r',
      stripeLinkAnnual: 'https://buy.stripe.com/bJedRabOxci26pQcq9eME0s',
    },
    {
      id: 'agency',
      label: 'Agency',
      price: '$49.99/mo',
      priceAnnual: '$499.99/yr',
      annualSavingsNote: '2 months free',
      missionsLabel: 'Unlimited operations',
      interval: 'Priority checks',
      summary: 'The full shop. Unlimited coverage, Sunday digest, webhooks.',
      featureBullets: [
        'Unlimited portfolios and operatives',
        'Priority hourly checks',
        'Device pings plus Sunday email digest',
        'Morning brief when something fired overnight',
        'Webhook out to your other systems',
        'Dedicated support',
      ],
      stripeLink: 'https://buy.stripe.com/00w7sM2dX5TE8xYeyheME0t',
      stripeLinkAnnual: 'https://buy.stripe.com/14A6oIaKt5TEbKafCleME0u',
    },
  ],
};

// ─── Active config ────────────────────────────────────────────────────────────

const baseConfig: ModeConfig = APP_MODE === 'gia' ? GIA_CONFIG : SECRET_AGENT_CONFIG;

// Allow VITE_APP_NAME to override the brand display name without a code change
const envName = (import.meta.env.VITE_APP_NAME as string | undefined)?.trim();

export const MODE: ModeConfig = {
  ...baseConfig,
  name: envName || baseConfig.name,
  documentTitle: envName || baseConfig.documentTitle,
};

export const isSecretAgent = APP_MODE === 'secret_agent';
export const isGIA = APP_MODE === 'gia';

/** Returns true when the user has hit their tier's mission limit */
export function atMissionLimit(activeMissionCount: number): boolean {
  return activeMissionCount >= MODE.missionLimit;
}
