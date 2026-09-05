import { useState, useEffect } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { isGuestSession, markAccountSaved } from './trial';

export interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  return { user, session, loading };
}

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUp(email: string, password: string) {
  return supabase.auth.signUp({ email, password });
}

export async function claimGuestAccount(email: string, password: string) {
  const { data: current } = await supabase.auth.getUser();
  if (current.user?.is_anonymous) {
    const { error } = await supabase.auth.updateUser({ email, password });
    if (error) {
      const { error: emailOnlyError } = await supabase.auth.updateUser({ email });
      if (emailOnlyError) return { data: current, error: emailOnlyError };
    }
    return { data: current, error: null };
  }
  return signUp(email, password);
}

export async function signOut() {
  const { data } = await supabase.auth.getUser();
  if (data.user && !isGuestSession(data.user)) {
    markAccountSaved();
  }
  return supabase.auth.signOut();
}
