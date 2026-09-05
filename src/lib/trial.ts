import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';

const SKIP_AUTOSTART_KEY = 'gia_skip_autostart';

/** First visit starts a guest trial. Landing only after they leave / sign out. */
export function shouldAutoStartTrial(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(SKIP_AUTOSTART_KEY) !== '1';
}

export function markSignedOut() {
  localStorage.setItem(SKIP_AUTOSTART_KEY, '1');
}

export function clearSignedOutSkip() {
  localStorage.removeItem(SKIP_AUTOSTART_KEY);
}

/** Guest trial: signed in, but no email yet. Data stays on this browser only. */
export function isGuestSession(user: User | null): boolean {
  if (!user) return false;
  return !!user.is_anonymous || !user.email;
}

/** True when there is no session at all (landing / signed out). */
export function needsEmailForFeatures(user: User | null): boolean {
  return !user;
}

export function trialDaysRemaining(user: User | null): number | null {
  if (!user?.created_at) return null;
  const started = new Date(user.created_at).getTime();
  const ends = started + 30 * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((ends - Date.now()) / (24 * 60 * 60 * 1000)));
}

export async function startGuestTrial(): Promise<{ ok: true } | { ok: false; error: string }> {
  clearSignedOutSkip();
  const { data, error } = await supabase.auth.signInAnonymously({
    options: { data: { signup_app: 'gia' } },
  });
  if (error || !data.user) {
    return {
      ok: false,
      error: error?.message || 'Could not start your trial. Refresh and try again.',
    };
  }

  await supabase.from('profiles').upsert(
    { id: data.user.id, tier: 'operative' },
    { onConflict: 'id' }
  );

  return { ok: true };
}
