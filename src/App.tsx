import { useState, useEffect } from 'react';
import SecretAgent from './views/SecretAgent';
import CommandCenter from './views/CommandCenter';
import Landing from './views/Landing';
import { useAuth } from './lib/auth';
import { MODE } from './lib/appMode';

type Mode = 'agent' | 'command';

export default function App() {
  const [mode, setMode] = useState<Mode>(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mission') || params.get('view') === 'command') return 'command';
    if (params.get('view') === 'agent') return 'agent';
    return MODE.defaultView;
  });
  const auth = useAuth();

  useEffect(() => {
    document.title = MODE.documentTitle;
  }, []);

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

  if (auth.loading) {
    return (
      <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center">
        <div className="flex items-center gap-3">
          <span className="pulse-dot" />
          <span className="font-mono text-xs text-[#a0a0a0] tracking-widest uppercase">
            Establishing secure connection...
          </span>
        </div>
      </div>
    );
  }

  // Unauthenticated users see the Skyland Reach landing page.
  if (!auth.user) {
    return <Landing />;
  }

  // Authenticated users go straight to the app — landing is never shown.
  return mode === 'agent'
    ? <SecretAgent auth={auth} onSwitchMode={() => setMode('command')} />
    : <CommandCenter auth={auth} onSwitchMode={() => setMode('agent')} />;
}
