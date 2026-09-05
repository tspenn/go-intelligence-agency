import { useState, useEffect } from 'react';
import SecretAgent from './views/SecretAgent';
import CommandCenter from './views/CommandCenter';
import Landing from './views/Landing';
import { useAuth } from './lib/auth';
import { MODE } from './lib/appMode';
import {
  isGuestTrialExpired,
  landingGate,
  rememberSession,
  shouldAutoStartTrial,
  startGuestTrial,
} from './lib/trial';

type Mode = 'agent' | 'command';

function viewFromUrl(): Mode {
  const params = new URLSearchParams(window.location.search);
  if (params.get('mission') || params.get('view') === 'command') return 'command';
  if (params.get('view') === 'agent') return 'agent';
  return MODE.defaultView;
}

function writeViewToUrl(next: Mode, replace: boolean) {
  const url = new URL(window.location.href);
  if (next === 'agent') url.searchParams.set('view', 'agent');
  else url.searchParams.set('view', 'command');
  url.searchParams.delete('trial');
  if (replace) window.history.replaceState({ view: next }, '', url);
  else window.history.pushState({ view: next }, '', url);
}

export default function App() {
  const [mode, setMode] = useState<Mode>(() => viewFromUrl());

  function goToView(next: Mode) {
    if (next === mode) return;
    writeViewToUrl(next, false);
    setMode(next);
  }
  const auth = useAuth();
  const [guestError, setGuestError] = useState<string | null>(null);
  const [startingGuest, setStartingGuest] = useState(
    () => typeof window !== 'undefined' && shouldAutoStartTrial(),
  );

  useEffect(() => {
    document.title = MODE.documentTitle;
    writeViewToUrl(viewFromUrl(), true);
  }, []);

  useEffect(() => {
    function onPop() {
      setMode(viewFromUrl());
    }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (auth.loading) return;
    if (auth.user) {
      rememberSession(auth.user);
      setStartingGuest(false);
      return;
    }
    if (!shouldAutoStartTrial()) {
      setStartingGuest(false);
      return;
    }

    setStartingGuest(true);
    void startGuestTrial().then((result) => {
      if (!result.ok) {
        setGuestError(result.error);
        setStartingGuest(false);
      }
    });
  }, [auth.loading, auth.user]);

  // Deep-link from notification tap: open Operations Hub when ?mission= is present
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.data?.type === 'MISSION_ALERT') {
        writeViewToUrl('command', true);
        setMode('command');
        const url = event.data.url;
        if (
          typeof url === 'string' &&
          /^https?:\/\//i.test(url) &&
          !url.startsWith(window.location.origin)
        ) {
          window.open(url, '_blank', 'noopener,noreferrer');
        }
      }
    }
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage);
  }, []);

  if (auth.loading || startingGuest) {
    return (
      <div className="min-h-screen bg-[#080a0c] flex items-center justify-center">
        <div className="flex items-center gap-3">
          <span className="pulse-dot pulse-dot-emerald" />
          <span className="font-mono text-xs text-[#a0a0a0] tracking-widest uppercase">
            Starting your operations hub...
          </span>
        </div>
      </div>
    );
  }

  const gate = landingGate(auth.user);
  if (!auth.user || isGuestTrialExpired(auth.user)) {
    return <Landing guestError={guestError} gate={gate} />;
  }

  // Authenticated users go straight to the app — landing is never shown.
  return mode === 'agent'
    ? <SecretAgent auth={auth} onSwitchMode={() => goToView('command')} />
    : <CommandCenter auth={auth} onSwitchMode={() => goToView('agent')} />;
}
