import { useState, useEffect, useRef } from 'react';
import { X, Lock, Eye, EyeOff, Mail, Info } from 'lucide-react';
import { signIn, signUp, claimGuestAccount } from '../lib/auth';

interface AuthModalProps {
  onClose: () => void;
  onSuccess: () => void;
  /** Optional initial mode — defaults to 'signin'. */
  initialMode?: 'signin' | 'signup' | 'claim';
}

type Mode = 'signin' | 'signup' | 'claim';

const SISTER_APPS_LINE =
  'One account for Secret Agent, FRIDAY Canvas, Go Shop, GoTRVL & LnkLokr';

/** Detect Supabase "this email already has an account" responses. */
function isExistingAccountError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('already registered') ||
    m.includes('already exists') ||
    m.includes('user already')
  );
}

export default function AuthModal({ onClose, onSuccess, initialMode = 'signin' }: AuthModalProps) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmSent, setConfirmSent] = useState(false);
  const [confirmedEmail, setConfirmedEmail] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);

  // ─── Close on Escape key ───────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // ─── Lock body scroll while open ───────────────────────────────────────────
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'signin') {
        const { error: err } = await signIn(email, password);
        if (err) throw err;
        onSuccess();
      } else {
        const { error: err, data } = mode === 'claim'
          ? await claimGuestAccount(email, password)
          : await signUp(email, password);
        if (err) {
          // Supabase sometimes returns an explicit error for existing emails
          if (isExistingAccountError(err.message)) {
            localStorage.removeItem('is_new');
            setError('__existing__');
          } else {
            throw err;
          }
        } else if (mode !== 'claim' && (data?.user?.identities?.length ?? 1) === 0) {
          // Supabase silent fake-success: email already registered,
          // no confirmation email was sent — identities array is empty
          localStorage.removeItem('is_new');
          setError('__existing__');
        } else if (data?.session || mode === 'claim') {
          // Guest trial is already signed in — do not block on inbox confirmation.
          onSuccess();
        } else {
          setConfirmedEmail(email);
          setConfirmSent(true);
        }
      }
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }

  // ─── Close on backdrop click ───────────────────────────────────────────────
  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  const heading =
    mode === 'signin'
      ? 'Welcome back'
      : mode === 'claim'
        ? 'Add email to use operatives'
        : 'Create your Skyland Reach account';

  return (
    <div
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        className="relative w-full max-w-sm bg-[#1a1a1a] border border-[#333] rounded-md shadow-2xl"
      >

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2e2e2e]">
          <div className="flex items-center gap-2.5">
            <Lock size={13} className="text-amber-500/80" />
            <span className="font-mono text-[11px] text-amber-500/70 tracking-[0.3em] uppercase">
              Skyland Reach
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-[#8a8a8a] hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {confirmSent ? (
          // ─── Email Confirmation State ────────────────────────────────────────
          <div className="px-6 py-10 text-center">
            <div className="text-5xl mb-4">📬</div>
            <p className="text-[#f5f0e8] font-semibold text-lg mb-2">Check your email</p>
            <p className="font-mono text-[12px] text-[#b0b0b0] leading-relaxed mb-1">
              We sent a confirmation link to:
            </p>
            <p className="font-mono text-[13px] text-amber-400 break-all mb-6">
              {confirmedEmail}
            </p>
            <p className="font-mono text-[11px] text-[#8a8a8a] leading-relaxed mb-6">
              Click the link in that email,<br />then come back to sign in.
            </p>
            <button
              onClick={() => {
                setConfirmSent(false);
                setMode('signin');
                setEmail(confirmedEmail);
                setPassword('');
              }}
              className="activate-btn w-full"
            >
              Go to sign in
            </button>
          </div>
        ) : (
          // ─── Sign-in / Sign-up Form ──────────────────────────────────────────
          <form onSubmit={handleSubmit} className="px-6 py-6 flex flex-col gap-4">
            <div className="text-center mb-1">
              <h2 className="text-[#f5f0e8] font-semibold text-lg mb-1.5">{heading}</h2>
              <p className="font-mono text-[11px] text-[#a0a0a0] leading-relaxed">
                {mode === 'claim'
                  ? 'Your 30-day trial is already running. Email is only needed to deploy operatives, turn on Pings, and run watches.'
                  : SISTER_APPS_LINE}
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[11px] text-[#a0a0a0] tracking-widest uppercase">
                Email
              </label>
              <div className="relative">
                <Mail
                  size={13}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666]"
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  placeholder="agent@example.com"
                  className="w-full bg-[#111] border border-[#333] rounded-sm pl-9 pr-3 py-2.5 text-sm text-[#f5f0e8] placeholder-[#444] font-mono focus:outline-none focus:border-amber-500/50 transition-colors"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[11px] text-[#a0a0a0] tracking-widest uppercase">
                Password
              </label>
              <div className="relative">
                <Lock
                  size={13}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666]"
                />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="••••••••"
                  className="w-full bg-[#111] border border-[#333] rounded-sm pl-9 pr-10 py-2.5 text-sm text-[#f5f0e8] placeholder-[#444] font-mono focus:outline-none focus:border-amber-500/50 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#a0a0a0] hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {/* Existing account — silent fake-success or explicit Supabase error */}
            {error === '__existing__' && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-md px-3.5 py-3">
                <div className="flex items-start gap-2.5">
                  <Info size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-amber-300 text-sm mb-1">
                      That email already has an account.
                    </p>
                    <p className="font-mono text-[11px] text-amber-200/70 leading-relaxed mb-2">
                      One Skyland Reach account works across GIA, Secret Agent,
                      FRIDAY Canvas, Go Shop, GoTRVL &amp; LnkLokr.
                    </p>
                    <button
                      type="button"
                      onClick={() => switchMode('signin')}
                      className="font-mono text-[11px] text-amber-400 hover:text-amber-300 underline underline-offset-2 transition-colors"
                    >
                      Log in instead →
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Generic error */}
            {error && error !== '__existing__' && (
              <p className="font-mono text-[12px] text-red-400 bg-red-500/10 border border-red-500/30 rounded-sm px-3 py-2">
                {error}
              </p>
            )}

            <button type="submit" disabled={loading} className="activate-btn mt-1">
              {loading
                ? 'Authenticating...'
                : mode === 'signin'
                  ? 'Sign in'
                  : mode === 'claim'
                    ? 'Save email and continue'
                    : 'Create account'}
            </button>

            {/* Footer mode toggle */}
            <p className="text-center font-mono text-[12px] text-[#a0a0a0] mt-1">
              {mode === 'signin' ? (
                <>
                  Don't have a Skyland Reach account?{' '}
                  <button
                    type="button"
                    onClick={() => switchMode('signup')}
                    className="text-amber-400 hover:text-amber-300 transition-colors underline underline-offset-2"
                  >
                    Create one free
                  </button>
                </>
              ) : (
                <>
                  Already have a Skyland Reach account?{' '}
                  <button
                    type="button"
                    onClick={() => switchMode('signin')}
                    className="text-amber-400 hover:text-amber-300 transition-colors underline underline-offset-2"
                  >
                    Sign in
                  </button>
                </>
              )}
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
