import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';

const TRIAL_STARTED_KEY = 'gia_trial_started_at';
const ACCOUNT_SAVED_KEY = 'gia_account_saved';
const OLD_SKIP_KEY = 'gia_skip_autostart';
const TRIAL_MS = 30 * 24 * 60 * 60 * 1000;

export type LandingGate = 'none' | 'saved' | 'expired';

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}

function trialStartedAt(): number | null {
  const raw = storage()?.getItem(TRIAL_STARTED_KEY);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function hasSavedAccount(): boolean {
  return storage()?.getItem(ACCOUNT_SAVED_KEY) === '1';
}

/** After they Save (email) or sign in, this browser always shows Sign In. */
export function markAccountSaved() {
  storage()?.setItem(ACCOUNT_SAVED_KEY, '1');
}

export function recordTrialStart(from?: string | number) {
  if (trialStartedAt() != null) return;
  const started =
    typeof from === 'number'
      ? from
      : typeof from === 'string'
        ? new Date(from).getTime()
        : Date.now();
  if (Number.isFinite(started)) {
    storage()?.setItem(TRIAL_STARTED_KEY, String(started));
  }
}

export function isTrialWindowOpen(): boolean {
  const started = trialStartedAt();
  if (started == null) return true;
  return Date.now() - started < TRIAL_MS;
}

/**
 * Guest trial: skip the landing for the full 30 days.
 * After they Save, or after day 30, they always get Sign In.
 */
export function shouldAutoStartTrial(): boolean {
  if (typeof window === 'undefined') return false;
  storage()?.removeItem(OLD_SKIP_KEY);
  if (hasSavedAccount()) return false;
  return isTrialWindowOpen();
}

export function landingGate(user: User | null): LandingGate {
  if (hasSavedAccount() && !user) return 'saved';
  if (isGuestTrialExpired(user) || (!user && !isTrialWindowOpen() && trialStartedAt() != null)) {
    return 'expired';
  }
  return 'none';
}

/** Guest trial: signed in, but no email yet. Data stays on this browser only. */
export function isGuestSession(user: User | null): boolean {
  if (!user) return false;
  return !!user.is_anonymous || !user.email;
}

export function rememberSession(user: User | null) {
  if (!user) return;
  if (isGuestSession(user)) {
    recordTrialStart(user.created_at);
    return;
  }
  markAccountSaved();
}

export function isGuestTrialExpired(user: User | null): boolean {
  if (!isGuestSession(user)) return false;
  return (trialDaysRemaining(user) ?? 0) <= 0;
}

/** True when there is no session at all (landing / signed out). */
export function needsEmailForFeatures(user: User | null): boolean {
  return !user;
}

export function trialDaysRemaining(user: User | null): number | null {
  const localStart = trialStartedAt();
  const startedAt = localStart ?? (user?.created_at ? new Date(user.created_at).getTime() : null);
  if (startedAt == null) return null;
  const ends = startedAt + TRIAL_MS;
  return Math.max(0, Math.ceil((ends - Date.now()) / (24 * 60 * 60 * 1000)));
}

export async function startGuestTrial(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (hasSavedAccount()) {
    return { ok: false, error: 'This browser already has a saved account. Sign in to continue.' };
  }
  if (!isTrialWindowOpen()) {
    return { ok: false, error: 'Your 30-day trial has ended. Save or sign in to keep going.' };
  }

  const { data, error } = await supabase.auth.signInAnonymously({
    options: { data: { signup_app: 'gia' } },
  });
  if (error || !data.user) {
    return {
      ok: false,
      error: error?.message || 'Could not start your trial. Refresh and try again.',
    };
  }

  recordTrialStart(data.user.created_at);

  await supabase.from('profiles').upsert(
    { id: data.user.id, tier: 'operative' },
    { onConflict: 'id' }
  );

  return { ok: true };
}
