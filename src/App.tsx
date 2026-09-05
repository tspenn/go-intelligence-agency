import { useState, useEffect } from 'react';
import SecretAgent from './views/SecretAgent';
import CommandCenter from './views/CommandCenter';
import Landing from './views/Landing';
import { useAuth } from './lib/auth';
import { MODE } from './lib/appMode';
import { isGuestSession, shouldAutoStartTrial, startGuestTrial } from './lib/trial';

type Mode = 'agent' | 'command';

export default function App() {
  const [mode, setMode] = useState<Mode>(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mission') || params.get('view') === 'command') return 'command';
    if (params.get('view') === 'agent') return 'agent';
    return MODE.defaultView;
  });
  const auth = useAuth();
  const [guestError, setGuestError] = useState<string | null>(null);
  const [startingGuest, setStartingGuest] = useState(
    () => typeof window !== 'undefined' && shouldAutoStartTrial(),
  );

  useEffect(() => {
    document.title = MODE.documentTitle;
  }, []);

  useEffect(() => {
    if (auth.loading) return;
    if (auth.user) {
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

  useEffect(() => {
    if (!isGuestSession(auth.user)) return;
    function onLeave(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [auth.user]);

  // Deep-link from notification tap: open Operations Hub when ?mission= is present
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.data?.type === 'MISSION_ALERT') {
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

  // Landing is only for people who left / signed out. First visit skips it.
  if (!auth.user) {
    return <Landing guestError={guestError} />;
  }

  // Authenticated users go straight to the app — landing is never shown.
  return mode === 'agent'
    ? <SecretAgent auth={auth} onSwitchMode={() => setMode('command')} />
    : <CommandCenter auth={auth} onSwitchMode={() => setMode('agent')} />;
}
