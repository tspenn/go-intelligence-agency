/**
 * Landing / Marketing page shown to UNAUTHENTICATED users only.
 *
 * Authenticated users skip this page — they go straight into the app
 * (SecretAgent or CommandCenter) per appMode.defaultView.
 */

import { useState } from 'react';
import { Check, Lock, Shield, ExternalLink, Zap, Bell, BarChart2 } from 'lucide-react';
import AuthModal from '../components/AuthModal';
import { MODE, isGIA, type TierConfig } from '../lib/appMode';
import { startGuestTrial } from '../lib/trial';

type AuthRequest = { open: boolean; mode: 'signin' | 'signup' };

export default function Landing({ guestError }: { guestError?: string | null }) {
  const [auth, setAuth] = useState<AuthRequest>({ open: false, mode: 'signin' });
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly');
  const [startingTrial, setStartingTrial] = useState(false);
  const [trialError, setTrialError] = useState<string | null>(guestError ?? null);

  const accent = MODE.brandAccent;
  const hasAnnual = MODE.tiers.some((t) => t.priceAnnual);

  const accentText  = isGIA ? 'text-emerald-400' : 'text-amber-400';
  const accentBg    = isGIA ? 'bg-emerald-500/10' : 'bg-amber-500/10';
  const accentBorder = isGIA ? 'border-emerald-500/30' : 'border-amber-500/30';
  const baseBg      = isGIA ? 'bg-[#080a0c]'  : 'bg-[#1a1a1a]';
  const borderColor = isGIA ? 'border-[#1a2a20]' : 'border-[#2a2a2a]';

  function openSignUp() { setAuth({ open: true, mode: 'signup' }); }
  function openSignIn() { setAuth({ open: true, mode: 'signin' }); }
  function closeAuth()  { setAuth({ open: false, mode: auth.mode }); }

  async function startFreeTrial() {
    if (!isGIA) {
      openSignUp();
      return;
    }
    setTrialError(null);
    setStartingTrial(true);
    const result = await startGuestTrial();
    setStartingTrial(false);
    if (!result.ok) {
      setTrialError(result.error);
      openSignUp();
    }
  }

  return (
    <div className={`min-h-screen ${baseBg} text-[#f5f0e8] font-['DM_Sans',sans-serif] flex flex-col`}>

      {/* ─── Top bar ──────────────────────────────────────────────────────────── */}
      <header className={`sticky top-0 z-30 border-b ${borderColor} ${baseBg}/95 backdrop-blur-sm`}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={`pulse-dot ${isGIA ? 'pulse-dot-emerald' : ''}`} />
            <span className="font-semibold text-sm tracking-[0.25em] uppercase text-[#f5f0e8]">
              {MODE.name}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={openSignIn}
              className={`font-mono text-[12px] uppercase tracking-widest text-[#a0a0a0] hover:text-white transition-colors px-3 py-1.5 rounded-sm border border-transparent hover:${borderColor}`}
            >
              Sign In
            </button>
            <button
              onClick={() => void startFreeTrial()}
              disabled={startingTrial}
              className={isGIA
                ? 'deploy-btn !py-2 !px-5 !text-[11px]'
                : 'activate-btn !py-2 !px-5 !text-[11px]'}
            >
              {startingTrial ? 'Starting…' : 'Start Free Trial'}
            </button>
          </div>
        </div>
      </header>

      {/* ─── Hero ─────────────────────────────────────────────────────────────── */}
      <section className={`border-b ${borderColor} relative overflow-hidden min-h-[70vh] md:min-h-[78vh] flex items-end md:items-center`}>
        {isGIA ? (
          <>
            <img
              src="/gia-header.jpg"
              alt=""
              className="absolute inset-0 w-full h-full object-cover object-center"
              fetchPriority="high"
            />
            {/* Tiny bottom blend into next section only — no full-image panel */}
            <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#080a0c] to-transparent" />
          </>
        ) : (
          <>
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(16,185,129,0.07)_0%,_transparent_55%)]" />
            <div className="absolute inset-0 cc-grid-bg opacity-20" />
          </>
        )}
        <div className="relative max-w-6xl mx-auto px-6 py-20 md:py-28 w-full">
          <div
            className={
              isGIA
                ? 'max-w-3xl rounded-sm bg-black/30 px-5 py-6 md:px-8 md:py-8'
                : 'max-w-3xl'
            }
          >
            {isGIA && (
              <p className="font-semibold text-sm md:text-base tracking-[0.3em] uppercase text-emerald-400 mb-5">
                {MODE.name}
              </p>
            )}
            {!isGIA && (
              <div className={`inline-flex items-center gap-2 ${accentBg} border ${accentBorder} rounded-full px-3 py-1 mb-6`}>
                <Shield size={11} className={accentText} />
                <span className={`font-mono text-[11px] tracking-widest uppercase ${accentText}`}>
                  {MODE.tagline}
                </span>
              </div>
            )}

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-semibold leading-tight tracking-tight mb-6">
              <Headline
                text={MODE.landing.headline}
                highlight={MODE.landing.headlineHighlight}
                accent={accentText}
              />
            </h1>

            <p className={`text-lg leading-relaxed max-w-2xl mb-10 ${isGIA ? 'text-[#f0ebe3]' : 'text-[#c0c0c0]'}`}>
              {MODE.landing.description}
            </p>

            <div className="flex flex-col items-start gap-3">
              <button
                onClick={() => void startFreeTrial()}
                disabled={startingTrial}
                className={isGIA ? 'deploy-btn text-base !px-10 !py-4' : 'activate-btn text-base px-8 py-3.5'}
              >
                {startingTrial ? 'Starting your trial…' : MODE.landing.heroCta}
              </button>
              <p className={`font-mono text-[12px] tracking-wide ${isGIA ? 'text-[#c8c8c8]' : 'text-[#888]'}`}>
                {MODE.landing.heroCtaNote}
              </p>
              {trialError && (
                <p className="font-mono text-[12px] text-red-400 max-w-xl">{trialError}</p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ─── How It Works (GIA only) ──────────────────────────────────────────── */}
      {isGIA && (
        <section className={`border-b ${borderColor}`}>
          <div className="max-w-6xl mx-auto px-6 py-20">
            <div className="text-center mb-14">
              <p className="font-mono text-[11px] tracking-[0.3em] uppercase text-emerald-400/70 mb-3">
                — How It Works —
              </p>
              <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">
                Intelligence on autopilot
              </h2>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  icon: Zap,
                  step: '01',
                  title: 'Deploy Operatives',
                  body: 'Choose an intelligence type — equities, news, competitors, weather, crypto — set a threshold and give it a portfolio. Done in under a minute.',
                },
                {
                  icon: BarChart2,
                  step: '02',
                  title: 'Monitor Every Signal',
                  body: 'GIA checks your operatives hourly across every data source. No polling required on your end. It runs whether your laptop is open or not.',
                },
                {
                  icon: Bell,
                  step: '03',
                  title: 'Get Briefed Instantly',
                  body: 'When a condition fires you get a push notification on your device, plus a weekly briefing every Sunday night summarizing everything that happened. Notifications must be turned on on your device/devices.',
                },
              ].map(({ icon: Icon, step, title, body }) => (
                <div key={step} className="relative">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 flex-shrink-0 rounded border border-emerald-500/20 bg-emerald-500/5 flex items-center justify-center">
                      <Icon size={16} className="text-emerald-400" />
                    </div>
                    <div>
                      <p className="font-mono text-[10px] text-emerald-500/40 tracking-[0.3em] uppercase mb-1">{step}</p>
                      <h3 className="font-semibold text-[#f5f0e8] mb-2">{title}</h3>
                      <p className="text-[#888] text-sm leading-relaxed">{body}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Intel types strip */}
            <div className={`mt-14 border ${borderColor} rounded-lg p-6 bg-[#0d1117]`}>
              <p className="font-mono text-[10px] text-[#555] tracking-[0.3em] uppercase text-center mb-5">
                10 Intelligence Types
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                {[
                  'Equity Prices', 'Crypto Markets', 'News Keywords', 'Sports',
                  'Public Pages', 'RSS Feeds', 'Retail Prices', 'Weather Alerts',
                  'Seismic Activity', 'Air Quality',
                ].map((t) => (
                  <span
                    key={t}
                    className="font-mono text-[11px] text-[#666] border border-[#1a2a20] rounded-full px-3 py-1.5 hover:border-emerald-500/30 hover:text-[#aaa] transition-colors"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ─── Pricing ──────────────────────────────────────────────────────────── */}
      <section className={`border-b ${borderColor}`}>
        <div className="max-w-6xl mx-auto px-6 py-20">
          <div className="text-center mb-12">
            <p className={`font-mono text-[11px] tracking-[0.3em] uppercase ${accentText} mb-3`}>
              — {MODE.landing.pricingHeading} —
            </p>
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mb-4">
              Simple pricing. Real value.
            </h2>
            <p className="text-[#a0a0a0] max-w-xl mx-auto leading-relaxed">
              {MODE.landing.pricingSubhead}
            </p>

            {hasAnnual && (
              <div className={`inline-flex mt-8 ${isGIA ? 'bg-[#0d1117]' : 'bg-[#1f1f1f]'} border ${borderColor} rounded-full p-1`}>
                {(['monthly', 'annual'] as const).map((b) => (
                  <button
                    key={b}
                    onClick={() => setBilling(b)}
                    className={`px-5 py-1.5 rounded-full font-mono text-[12px] tracking-widest uppercase transition-colors ${
                      billing === b ? `${accentBg} ${accentText}` : 'text-[#888] hover:text-[#c0c0c0]'
                    }`}
                  >
                    {b}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className={`grid gap-5 ${MODE.tiers.length === 2 ? 'md:grid-cols-2 max-w-3xl mx-auto' : 'md:grid-cols-3'}`}>
            {MODE.tiers.map((tier) => (
              <PricingCard
                key={tier.id}
                tier={tier}
                billing={billing}
                accent={accent}
                onFreeCta={() => void startFreeTrial()}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ─── Footer ───────────────────────────────────────────────────────────── */}
      <footer className={`mt-auto border-t ${borderColor} ${isGIA ? 'bg-[#050708]' : 'bg-[#141414]'}`}>
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
          <p className="font-mono text-[12px] text-[#888]">
            A <span className="text-[#c0c0c0]">Skyland Reach</span> product ·{' '}
            <a
              href={isGIA ? 'mailto:support@go-i-agency.com' : 'mailto:support@skylandreach.com'}
              className={`hover:${accentText} transition-colors`}
            >
              {isGIA ? 'support@go-i-agency.com' : 'support@skylandreach.com'}
            </a>
          </p>
          <p className="font-mono text-[12px] text-[#888]">
            Cancel at any time · Your data is yours · Never sold
          </p>
        </div>
      </footer>

      {auth.open && (
        <AuthModal
          initialMode={auth.mode}
          onClose={closeAuth}
          onSuccess={closeAuth}
        />
      )}
    </div>
  );
}

// ─── Headline component ────────────────────────────────────────────────────────

function Headline({ text, highlight, accent }: { text: string; highlight?: string; accent: string }) {
  if (!highlight || !text.includes(highlight)) return <>{text}</>;
  const parts = text.split(highlight);
  return (
    <>
      {parts[0]}
      <span className={accent}>{highlight}</span>
      {parts[1]}
    </>
  );
}

// ─── Pricing card ──────────────────────────────────────────────────────────────

function PricingCard({
  tier,
  billing,
  accent,
  onFreeCta,
}: {
  tier: TierConfig;
  billing: 'monthly' | 'annual';
  accent: 'amber' | 'emerald';
  onFreeCta: () => void;
}) {
  const accentText   = accent === 'emerald' ? 'text-emerald-400' : 'text-amber-400';
  const accentBg     = accent === 'emerald' ? 'bg-emerald-500/10' : 'bg-amber-500/10';
  const accentBorder = accent === 'emerald' ? 'border-emerald-500/40' : 'border-amber-500/40';
  const cardBg       = accent === 'emerald' ? 'bg-[#0d1117]' : 'bg-[#1f1f1f]';
  const cardBorder   = accent === 'emerald' ? 'border-[#1a2a20]' : 'border-[#333]';

  const isAnnual    = billing === 'annual' && !!tier.priceAnnual;
  const displayPrice = isAnnual ? tier.priceAnnual! : tier.price;
  const stripeUrl   = isAnnual && tier.stripeLinkAnnual ? tier.stripeLinkAnnual : tier.stripeLink;

  const ctaClass = accent === 'emerald' ? 'deploy-btn w-full' : 'activate-btn w-full';

  return (
    <div className={`relative ${cardBg} rounded-xl p-6 flex flex-col ${
      tier.highlight ? `border-2 ${accentBorder} shadow-2xl` : `border ${cardBorder}`
    }`}>
      {tier.highlight && (
        <div className={`absolute -top-3 left-1/2 -translate-x-1/2 ${accentBg} ${accentText} border ${accentBorder} rounded-full px-3 py-0.5 font-mono text-[10px] tracking-widest uppercase`}>
          Most Popular
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-[12px] tracking-[0.3em] uppercase text-[#c8c0b0]">
          {tier.label}
        </span>
        {tier.trial && (
          <span className="bg-green-500/15 border border-green-500/30 rounded-sm px-2 py-0.5 font-mono text-[10px] text-green-400 tracking-widest uppercase">
            {tier.trial}
          </span>
        )}
      </div>

      <div className="mb-2">
        <p className="text-3xl font-semibold text-[#f5f0e8]">
          {tier.trial && billing === 'monthly' && (
            <span className="text-[#888] text-base font-normal">then </span>
          )}
          {displayPrice}
        </p>
        {isAnnual && tier.annualSavingsNote && (
          <p className={`font-mono text-[11px] mt-0.5 ${accentText}`}>
            {tier.annualSavingsNote}
          </p>
        )}
      </div>

      <p className="font-mono text-[12px] text-[#a0a0a0] mb-1">{tier.missionsLabel}</p>
      <p className="font-mono text-[12px] text-[#888] mb-4">{tier.interval}</p>

      {tier.featureBullets && tier.featureBullets.length > 0 && (
        <ul className="flex flex-col gap-2.5 mb-6 mt-2">
          {tier.featureBullets.map((feat) => (
            <li key={feat} className="flex items-start gap-2.5 text-sm text-[#d0d0d0] leading-snug">
              <Check size={14} className={`flex-shrink-0 mt-0.5 ${accentText}`} />
              <span>{feat}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto">
        {tier.isFree || !stripeUrl || stripeUrl.includes('REPLACE_WITH') ? (
          <button onClick={onFreeCta} className={ctaClass}>
            {tier.trial ? `Start ${tier.trial.toLowerCase()} free` : 'Start free'}
          </button>
        ) : (
          <>
            <a
              href={stripeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`${ctaClass} gap-2`}
            >
              Subscribe — {displayPrice}
              <ExternalLink size={13} />
            </a>
            <p className="text-center font-mono text-[10px] text-[#888] mt-2 flex items-center justify-center gap-1.5">
              <Lock size={9} />
              Secure checkout via Stripe · Cancel anytime
            </p>
          </>
        )}
      </div>
    </div>
  );
}
