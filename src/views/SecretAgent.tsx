import { useState, useEffect, useRef } from 'react';
import {
  Eye, Shield, Cloud, Tag, Settings, Bell, BellOff, LogOut, LogIn, TrendingUp,
  Bitcoin, Activity, Wind, Globe, Rss, Newspaper, FolderOpen,
  Webhook, FolderKanban, Trophy, ExternalLink, ChevronDown, RefreshCw,
} from 'lucide-react';
import { supabase, type SecretAgentMission, type SecretAgentAlert, type WatchType, parseCondition, GIA_TIER_LIMITS, getWatchOpenUrl, getFindingOpenUrl } from '../lib/supabase';
import { signOut } from '../lib/auth';
import { pushSupported, getPushPermission, enablePushNotifications, disablePushNotifications, restoreAndSyncPush } from '../lib/pushNotifications';
import AuthModal from '../components/AuthModal';
import SettingsModal from '../components/SettingsModal';
import PortfolioView from '../components/PortfolioView';
import type { AuthState } from '../lib/auth';
import { MODE, isGIA, isSecretAgent, atMissionLimit } from '../lib/appMode';
import { isGuestSession, trialDaysRemaining } from '../lib/trial';
import LeaveWarning from '../components/LeaveWarning';

// ─── Watch type config ────────────────────────────────────────────────────────

interface WatchOption {
  boardId: string;
  value: WatchType;
  label: string;
  sublabel: string;
  placeholder: { target: string; condition: string };
  icon: typeof Eye;
  /** Extra metadata stored on deploy (e.g. sports → news_keyword) */
  metadata?: Record<string, unknown>;
}

const SA_WATCH_OPTIONS: WatchOption[] = [
  { boardId: 'sale_price', value: 'sale_price', label: 'A Sale Price', sublabel: '', icon: Tag, placeholder: { target: 'https://store.com/product', condition: 'price drops below $50' } },
  { boardId: 'weather', value: 'severe_weather', label: 'Severe Weather', sublabel: '', icon: Cloud, placeholder: { target: 'Miami, FL', condition: 'any severe weather warning' } },
  { boardId: 'stock_price', value: 'stock_price', label: 'A Stock Price', sublabel: '', icon: TrendingUp, placeholder: { target: 'AAPL', condition: 'price drops below $150' } },
  { boardId: 'crypto_price', value: 'crypto_price', label: 'A Crypto Price', sublabel: '', icon: Bitcoin, placeholder: { target: 'bitcoin', condition: 'drops below $60000' } },
  { boardId: 'earthquake', value: 'earthquake', label: 'Earthquake Activity', sublabel: '', icon: Activity, placeholder: { target: 'California', condition: 'magnitude above 4.5' } },
  { boardId: 'air_quality', value: 'air_quality', label: 'Air Quality', sublabel: '', icon: Wind, placeholder: { target: 'Los Angeles, CA', condition: 'AQI above 100' } },
  { boardId: 'website', value: 'website_change', label: 'A Website Change', sublabel: '', icon: Globe, placeholder: { target: 'https://example.com/page', condition: 'any change appears' } },
  { boardId: 'rss_feed', value: 'rss_feed', label: 'An RSS Feed', sublabel: '', icon: Rss, placeholder: { target: 'https://blog.com/feed.xml', condition: 'a new post is published' } },
  { boardId: 'news', value: 'news_keyword', label: 'News for a Keyword', sublabel: '', icon: Newspaper, placeholder: { target: 'tesla recall', condition: 'any new article appears' } },
];

// GIA = intelligence signals. Finance/accounts = My$ / MNY$ — never GIA.
const GIA_WATCH_OPTIONS: WatchOption[] = [
  { boardId: 'equity', value: 'stock_price', label: 'Equity', sublabel: 'Stock threshold', icon: TrendingUp, placeholder: { target: 'AAPL, NVDA, TSLA', condition: 'drops below $150' } },
  { boardId: 'digital', value: 'crypto_price', label: 'Digital Asset', sublabel: 'Crypto price', icon: Bitcoin, placeholder: { target: 'bitcoin', condition: 'drops below $60,000' } },
  { boardId: 'intel', value: 'news_keyword', label: 'Intelligence', sublabel: 'News & keywords', icon: Newspaper, placeholder: { target: 'Federal Reserve rate cut', condition: 'any new article' } },
  { boardId: 'sports', value: 'news_keyword', label: 'Sports', sublabel: 'Games, odds, leagues', icon: Trophy, placeholder: { target: 'Lakers', condition: 'any new article' }, metadata: { category: 'sports' } },
  { boardId: 'page', value: 'website_change', label: 'Public Page', sublabel: 'Any open URL — changes & warnings', icon: Globe, placeholder: { target: 'https://competitor.com/pricing', condition: 'any change or warning appears' } },
  { boardId: 'feed', value: 'rss_feed', label: 'Industry Feed', sublabel: 'RSS / publications', icon: Rss, placeholder: { target: 'https://reuters.com/finance/feed', condition: 'any new item' } },
  { boardId: 'market', value: 'sale_price', label: 'Market Price', sublabel: 'Public price pages', icon: Tag, placeholder: { target: 'https://site.com/product', condition: 'drops below $500' } },
  { boardId: 'weather', value: 'severe_weather', label: 'Weather', sublabel: 'City or US zip', icon: Cloud, placeholder: { target: '28677', condition: 'any severe warning' } },
  { boardId: 'seismic', value: 'earthquake', label: 'Seismic', sublabel: 'Earthquake alerts', icon: Activity, placeholder: { target: 'Pacific Northwest', condition: 'magnitude above 5.0' } },
  { boardId: 'environment', value: 'air_quality', label: 'Environment', sublabel: 'AQI monitoring', icon: Wind, placeholder: { target: 'Houston, TX', condition: 'AQI above 150' } },
  { boardId: 'other', value: 'news_keyword', label: 'Other', sublabel: 'Anything else — a topic or a URL', icon: Eye, placeholder: { target: 'A topic, name, or https://…', condition: 'any new mention or change' }, metadata: { category: 'other' } },
];

const WATCH_ICONS: Record<WatchType, typeof Eye> = {
  sale_price: Tag, severe_weather: Cloud, bank_balance: Shield, stock_price: TrendingUp,
  crypto_price: Bitcoin, earthquake: Activity, air_quality: Wind,
  website_change: Globe, rss_feed: Rss, news_keyword: Newspaper,
};

const WATCH_STATUS: Record<WatchType, string> = {
  sale_price: 'Scanning price feeds — no movement yet.',
  severe_weather: 'Monitoring atmospheric conditions.',
  bank_balance: 'Eyes on the account. All quiet.',
  stock_price: 'Tracking market activity.',
  crypto_price: 'Watching the chain — markets steady.',
  earthquake: 'Listening to seismic feeds.',
  air_quality: 'Sampling the atmosphere.',
  website_change: 'Watching the page for any movement.',
  rss_feed: 'Awaiting the next dispatch.',
  news_keyword: 'Scanning intelligence feeds.',
};

const TICKER_TEXT =
  '[ SYSTEM SECURE ] · ALL AGENTS ACTIVE · WATCHING THE GRID · NO ANOMALIES DETECTED · CHANNEL ENCRYPTED · STANDING BY · ';

function resolveWatchType(option: WatchOption, target: string): WatchType {
  if (option.boardId !== 'other') return option.value;
  return /^https?:\/\//i.test(target.trim()) ? 'website_change' : 'news_keyword';
}

function operativeCodename(): string {
  const adj = ['BLUE', 'GOLDEN', 'SILENT', 'IRON', 'CRIMSON', 'AMBER', 'SILVER', 'DARK', 'SWIFT', 'HOLLOW'];
  const noun = ['FALCON', 'LOTUS', 'CLOCK', 'CURTAIN', 'SIGNAL', 'NEEDLE', 'SPARROW', 'DESK', 'ANCHOR', 'VIPER'];
  return isGIA
    ? `Operative: ${adj[Math.floor(Math.random() * adj.length)]}-${noun[Math.floor(Math.random() * noun.length)]}`
    : `Operation: ${adj[Math.floor(Math.random() * adj.length)]} ${noun[Math.floor(Math.random() * noun.length)]}`;
}

function SATicker() {
  const full = TICKER_TEXT.repeat(4);
  return (
    <div className="overflow-hidden border-t border-amber-900/30 bg-[#111111] py-2.5">
      <div className="ticker-scroll font-mono text-xs text-green-500/60 tracking-widest whitespace-nowrap">
        {full}{full}
      </div>
    </div>
  );
}

function MissionCard({
  mission,
  findings,
  onDeactivate,
}: {
  mission: SecretAgentMission;
  findings: SecretAgentAlert[];
  onDeactivate: (id: string) => void;
}) {
  const isSports = (mission.metadata as { category?: string } | null)?.category === 'sports';
  const Icon = isSports ? Trophy : (WATCH_ICONS[mission.watch_type as WatchType] ?? Eye);
  const isAlert = mission.status_message.startsWith('⚠') || mission.status_message.startsWith('✓');
  const accentClass = isGIA ? 'text-emerald-400' : 'text-amber-400';
  const alertClass = isAlert ? (isGIA ? 'text-emerald-400/90' : 'text-amber-400/90') : 'text-green-400/80';
  const openUrl = getWatchOpenUrl(mission);

  return (
    <div className={`rounded-sm p-5 group border transition-all ${
      isGIA
        ? 'bg-[#0e1a14] border-[#1a3325] hover:border-emerald-500/30 hover:bg-[#111f17]'
        : 'mission-card bg-[#232323] border-[#333]'
    }`}>
      <div className="flex items-start gap-4">
        <div className={`mt-0.5 w-8 h-8 flex items-center justify-center rounded-sm border flex-shrink-0 ${
          isGIA ? 'bg-[#0a1510] border-[#1a3325]' : 'bg-[#1a1a1a] border-[#333]'
        }`}>
          <Icon size={15} className={isAlert ? `${accentClass} animate-pulse` : accentClass} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-[#f5f0e8] font-semibold text-sm tracking-wide truncate">{mission.codename}</p>
            {isGIA && mission.portfolio_name && (
              <span className="flex-shrink-0 flex items-center gap-1 font-mono text-[10px] text-emerald-500/60 bg-emerald-500/10 border border-emerald-500/20 rounded px-1.5 py-0.5">
                <FolderOpen size={9} />
                {mission.portfolio_name}
              </span>
            )}
          </div>
          <p className={`font-mono text-[13px] leading-relaxed truncate ${alertClass}`}>
            {mission.status_message}
          </p>
          {openUrl && (
            <a
              href={openUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className={`inline-flex items-center gap-1.5 mt-2 font-mono text-[11px] uppercase tracking-widest ${accentClass} hover:underline underline-offset-2`}
            >
              <ExternalLink size={11} />
              Open source
            </a>
          )}
          <p className="font-mono text-[12px] text-[#a0a0a0] mt-1 truncate">
            {isGIA ? 'TARGET' : 'TARGET'}: {mission.target || '—'} · {isGIA ? 'THRESHOLD' : 'TRIGGER'}: {mission.condition_text || '—'}
          </p>
          {mission.last_value && (
            <p className={`mt-2 text-sm leading-relaxed ${isGIA ? 'text-[#e8eee9]' : 'text-[#c8c0b0]'}`}>
              Last report: {mission.last_value}
            </p>
          )}
          {mission.last_checked_at && (
            <p className="font-mono text-[11px] text-[#8a8a8a] mt-0.5">
              Last check: {new Date(mission.last_checked_at).toLocaleString()}
            </p>
          )}

          <details className="mt-3 group/record">
            <summary className={`cursor-pointer list-none flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest py-1 [&::-webkit-details-marker]:hidden ${isGIA ? 'text-emerald-500/80 hover:text-emerald-400' : 'text-amber-500/80 hover:text-amber-400'}`}>
              <ChevronDown size={12} className="transition-transform group-open/record:rotate-180" />
              Record · {findings.length} finding{findings.length === 1 ? '' : 's'}
            </summary>
            <div className={`mt-3 border-t pt-3 flex flex-col gap-2 ${isGIA ? 'border-[#1a3325]' : 'border-[#333]'}`}>
              {findings.length === 0 ? (
                <p className="font-mono text-[12px] text-[#777]">No findings logged yet. Hits will collect here as the watch sweeps.</p>
              ) : (
                findings.map((finding, index) => {
                  const url = getFindingOpenUrl(finding, openUrl, index === 0);
                  const when = new Date(finding.triggered_at).toLocaleString();
                  return (
                    <div key={finding.id} className="min-w-0">
                      {url ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`font-mono text-[12px] underline underline-offset-2 inline-flex items-start gap-1 ${isGIA ? 'text-emerald-400/90' : 'text-amber-400/90'}`}
                        >
                          <span>{finding.message}</span>
                          <ExternalLink size={10} className="flex-shrink-0 mt-0.5" />
                        </a>
                      ) : (
                        <p className="font-mono text-[12px] text-[#c8c0b0]">{finding.message}</p>
                      )}
                      <p className="font-mono text-[11px] text-[#777] mt-0.5">{when}</p>
                    </div>
                  );
                })
              )}
              <button
                type="button"
                onClick={(e) => {
                  const details = (e.currentTarget as HTMLElement).closest('details');
                  if (details) details.open = false;
                }}
                className={`mt-1 self-start font-mono text-[11px] uppercase tracking-widest ${isGIA ? 'text-[#888] hover:text-emerald-400' : 'text-[#888] hover:text-amber-400'}`}
              >
                Close record
              </button>
            </div>
          </details>
        </div>
        <button
          onClick={() => onDeactivate(mission.id)}
          className="flex-shrink-0 text-[11px] font-mono uppercase tracking-widest text-red-700 hover:text-red-400 transition-colors duration-150 opacity-0 group-hover:opacity-100 pt-0.5"
        >
          {isGIA ? 'Terminate' : 'Deactivate'}
        </button>
      </div>
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

export default function SecretAgent({ auth, onSwitchMode }: { auth: AuthState; onSwitchMode: () => void }) {
  const [boardId, setBoardId] = useState(isGIA ? 'equity' : 'sale_price');
  const [target, setTarget] = useState('');
  const [condition, setCondition] = useState('');
  const [portfolioName, setPortfolioName] = useState('');
  const [missions, setMissions] = useState<SecretAgentMission[]>([]);
  const [findings, setFindings] = useState<SecretAgentAlert[]>([]);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushPermission, setPushPermission] = useState<string>('default');
  const [pushError, setPushError] = useState<string | null>(null);
  const [notifyPush, setNotifyPush] = useState(true);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [userTier, setUserTier] = useState<string>('operative');
  const [activating, setActivating] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'signin' | 'signup' | 'claim'>('signin');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showLeaveWarning, setShowLeaveWarning] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showPortfolioView, setShowPortfolioView] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const user = auth.user;
  const MISSION_LIMIT = MODE.missionLimit;
  const watchOptions = isGIA ? GIA_WATCH_OPTIONS : SA_WATCH_OPTIONS;
  const selectedOption = watchOptions.find((o) => o.boardId === boardId) ?? watchOptions[0];
  const watchType = resolveWatchType(selectedOption, target);

  useEffect(() => {
    if (user) {
      void loadMissions();
      void loadFindings();
    } else {
      setMissions([]);
      setFindings([]);
    }
  }, [user]);

  useEffect(() => {
    void getPushPermission().then((p) => setPushPermission(p));
    if (!user) return;
    void restoreAndSyncPush(user.id).then((restored) => {
      setPushEnabled(restored.enabled);
      setPushError(restored.error);
    });
  }, [user]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    setLimitReached(atMissionLimit(missions.filter((m) => m.active).length));
  }, [missions]);

  async function loadMissions() {
    if (!user) return;
    const [missionsRes, profileRes] = await Promise.all([
      supabase
        .from('secret_agent_missions')
        .select('*')
        .eq('user_id', user.id)
        .eq('active', true)
        .order('created_at', { ascending: false }),
      supabase
        .from('profiles')
        .select('tier')
        .eq('id', user.id)
        .maybeSingle(),
    ]);
    if (missionsRes.data) setMissions(missionsRes.data as SecretAgentMission[]);
    if (profileRes.data) {
      setUserTier(profileRes.data.tier ?? 'operative');
    }
  }

  async function loadFindings() {
    if (!user) return;
    const { data } = await supabase
      .from('secret_agent_alerts')
      .select('*')
      .eq('user_id', user.id)
      .eq('alert_type', 'condition_met')
      .order('triggered_at', { ascending: false })
      .limit(100);
    if (data) setFindings(data as SecretAgentAlert[]);
  }

  async function refreshIntel() {
    if (!user || refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([loadMissions(), loadFindings()]);
    } finally {
      setRefreshing(false);
    }
  }

  async function activateMission() {
    if (!target.trim() || !condition.trim()) return;
    if (!user) {
      setAuthModalMode('signin');
      setShowAuthModal(true);
      return;
    }
    if (limitReached) return;

    setActivating(true);
    const { operator, value } = parseCondition(condition);

    const newMission = {
      user_id: user.id,
      codename: operativeCodename(),
      watch_type: watchType,
      target: target.trim(),
      condition_text: condition.trim(),
      condition_operator: operator,
      condition_value: value,
      status_message: selectedOption.metadata?.category === 'sports'
        ? 'Scanning sports wires.'
        : WATCH_STATUS[watchType],
      active: true,
      check_interval_minutes: 60,
      metadata: selectedOption.metadata ?? {},
      portfolio_name: portfolioName.trim() || null,
      notify_push: notifyPush,
      webhook_url: webhookUrl.trim() || null,
      // Delay first real check ~1 hour — no ping on deploy/startup
      last_checked_at: new Date().toISOString(),
    };

    const { data } = await supabase.from('secret_agent_missions').insert(newMission).select().maybeSingle();
    if (data) setMissions((prev) => [data as SecretAgentMission, ...prev]);
    setTarget('');
    setCondition('');
    setPortfolioName('');
    setActivating(false);
  }

  async function deactivateMission(id: string) {
    await supabase.from('secret_agent_missions').update({ active: false }).eq('id', id);
    setMissions((prev) => prev.filter((m) => m.id !== id));
  }

  async function togglePush() {
    if (!user) {
      setAuthModalMode('signin');
      setShowAuthModal(true);
      return;
    }
    setPushError(null);
    if (pushEnabled) {
      await disablePushNotifications(user.id);
      setPushEnabled(false);
      setPushPermission('default');
    } else {
      const result = await enablePushNotifications(user.id);
      if (result.ok) {
        setPushEnabled(true);
        setPushPermission('granted');
        setPushError(null);
      } else {
        setPushError(result.error);
        setPushPermission(await getPushPermission());
      }
    }
  }

  // ─── GIA-specific render ────────────────────────────────────────────────────

  if (isGIA) return (
    <>
      {isGuestSession(user) && (
        <div className="bg-emerald-500/10 border-b border-emerald-500/20 px-6 py-2.5 text-center">
          <p className="font-mono text-[12px] text-emerald-300">
            {trialDaysRemaining(user) != null
              ? `${trialDaysRemaining(user)} days left in your free trial.`
              : 'Your free 30-day trial is running.'}
            {' '}This browser keeps it.
            {' '}
            <button
              type="button"
              onClick={() => {
                setAuthModalMode('claim');
                setShowAuthModal(true);
              }}
              className="underline underline-offset-2 hover:text-white"
            >
              Save
            </button>
            {' '}to keep it if you leave or switch devices.
          </p>
        </div>
      )}
      <GIAView
        boardId={boardId} setBoardId={setBoardId}
        target={target} setTarget={setTarget}
        condition={condition} setCondition={setCondition}
        portfolioName={portfolioName} setPortfolioName={setPortfolioName}
        missions={missions}
        findings={findings}
        activating={activating} activateMission={activateMission}
        deactivateMission={deactivateMission}
        limitReached={limitReached}
        user={user}
        userTier={userTier}
        pushEnabled={pushEnabled} pushPermission={pushPermission}
        togglePush={togglePush} pushError={pushError}
        notifyPush={notifyPush} setNotifyPush={setNotifyPush}
        webhookUrl={webhookUrl} setWebhookUrl={setWebhookUrl}
        onSwitchMode={onSwitchMode}
        showAuthModal={showAuthModal} setShowAuthModal={(open) => {
          if (open) setAuthModalMode('signin');
          setShowAuthModal(open);
        }}
        setShowSettingsModal={setShowSettingsModal}
        setShowPortfolioView={setShowPortfolioView}
        onLeave={() => {
          if (isGuestSession(user)) setShowLeaveWarning(true);
          else void signOut();
        }}
        loadMissions={loadMissions}
        refreshIntel={refreshIntel}
        refreshing={refreshing}
        selectedOption={selectedOption}
        MISSION_LIMIT={MISSION_LIMIT}
      />
      {showLeaveWarning && (
        <LeaveWarning
          onStay={() => setShowLeaveWarning(false)}
          onSave={() => {
            setShowLeaveWarning(false);
            setAuthModalMode('claim');
            setShowAuthModal(true);
          }}
          onLeave={() => {
            setShowLeaveWarning(false);
            void signOut();
          }}
        />
      )}
      {showAuthModal && (
        <AuthModal
          initialMode={authModalMode}
          onClose={() => setShowAuthModal(false)}
          onSuccess={() => { setShowAuthModal(false); loadMissions(); }}
        />
      )}
      {showSettingsModal && user && (
        <SettingsModal
          userId={user.id}
          onClose={() => setShowSettingsModal(false)}
          onPushChange={(enabled) => {
            setPushEnabled(enabled);
            void getPushPermission().then(setPushPermission);
          }}
        />
      )}
      {showPortfolioView && (
        <PortfolioView
          missions={missions}
          onClose={() => setShowPortfolioView(false)}
          onMissionsChanged={loadMissions}
        />
      )}
    </>
  );

  // ─── Secret Agent render (original) ────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#1a1a1a] text-[#f5f0e8] flex flex-col font-['DM_Sans',sans-serif]">
      <header className="border-b border-[#2e2e2e] px-6 py-4 flex items-center justify-between max-w-3xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <span className="pulse-dot" />
          <span className="font-sans font-semibold text-sm tracking-[0.25em] uppercase text-[#f5f0e8]">{MODE.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onSwitchMode} className="text-[12px] font-mono uppercase tracking-widest text-[#8a8a8a] hover:text-amber-400 transition-colors duration-150 border border-[#333] hover:border-amber-500/40 px-2.5 py-1.5 rounded-sm">
            Command Center
          </button>
          {user ? (
            <div className="flex items-center gap-2">
              <span className="hidden sm:block font-mono text-[11px] text-[#a0a0a0] max-w-[120px] truncate">{user.email}</span>
              <button
                onClick={() => {
                  if (isGuestSession(user)) setShowLeaveWarning(true);
                  else void signOut();
                }}
                title={isGuestSession(user) ? 'Leave' : 'Sign out'}
                className="w-8 h-8 flex items-center justify-center rounded-full border border-[#333] hover:border-red-500/40 transition-colors text-[#a0a0a0] hover:text-red-400"
              >
                <LogOut size={13} />
              </button>
            </div>
          ) : (
            <button onClick={() => setShowAuthModal(true)} className="flex items-center gap-1.5 text-[12px] font-mono uppercase tracking-widest text-[#a0a0a0] hover:text-amber-400 transition-colors border border-[#333] hover:border-amber-500/40 px-2.5 py-1.5 rounded-sm">
              <LogIn size={11} />Sign In
            </button>
          )}
          <button
            type="button"
            onClick={() => void refreshIntel()}
            disabled={!user || refreshing}
            title="Refresh"
            className="w-8 h-8 flex items-center justify-center rounded-full border border-[#333] hover:border-amber-500/50 transition-colors text-[#a0a0a0] hover:text-amber-400 disabled:opacity-40"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setShowSettingsModal(true)} className="w-8 h-8 flex items-center justify-center rounded-full border border-[#333] hover:border-amber-500/50 transition-colors text-[#a0a0a0] hover:text-amber-400">
            <Settings size={14} />
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-12 md:py-16">
        <section className="mb-14">
          <p className="font-mono text-[12px] text-amber-400/90 tracking-[0.3em] uppercase mb-8">— Classified Briefing Form —</p>
          <div className="briefing-form text-2xl md:text-3xl text-[#f5f0e8] leading-loose font-light">
            <span>I want to watch</span>{' '}
            <span className="relative inline-block" ref={dropdownRef}>
              <button onClick={() => setDropdownOpen((v) => !v)} className="inline-flex items-center gap-1 border-b-2 border-amber-500/60 hover:border-amber-400 outline-none transition-colors text-amber-400 font-semibold pb-0.5 cursor-pointer">
                {selectedOption.label}
                <span className="text-amber-500/40 text-base ml-0.5">▾</span>
              </button>
              {dropdownOpen && (
                <div className="absolute left-0 top-full mt-2 bg-[#232323] border border-[#3a3a3a] rounded-sm shadow-2xl z-50 min-w-[200px]">
                  {SA_WATCH_OPTIONS.map((opt) => (
                    <button key={opt.boardId} onClick={() => { setBoardId(opt.boardId); setDropdownOpen(false); }}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${boardId === opt.boardId ? 'text-amber-400 bg-amber-500/10' : 'text-[#c8c0b0] hover:bg-[#2e2e2e] hover:text-[#f5f0e8]'}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </span>
            <span>. Monitor it here:</span>{' '}
            <input type="text" value={target} onChange={(e) => setTarget(e.target.value)} placeholder={selectedOption.placeholder.target} className="ledger-input" />
            <span>. Sound the alarm when</span>{' '}
            <input type="text" value={condition} onChange={(e) => setCondition(e.target.value)} placeholder={selectedOption.placeholder.condition} className="ledger-input" onKeyDown={(e) => e.key === 'Enter' && activateMission()} />
            <span>.</span>
          </div>

          <div className="mt-10 flex flex-col items-start gap-5">
            {limitReached && user && isSecretAgent && (
              <div className="w-full bg-amber-500/5 border border-amber-500/20 rounded-sm px-4 py-3">
                <p className="font-mono text-[12px] text-amber-500/80 tracking-wide">
                  MISSION LIMIT REACHED ({MISSION_LIMIT}/{MISSION_LIMIT}) — Deactivate a mission or{' '}
                  <a href="https://go-i-agency.com" className="text-amber-400 hover:text-amber-300 underline underline-offset-2 transition-colors">upgrade to GIA</a> for unlimited.
                </p>
              </div>
            )}
            <button onClick={activateMission} disabled={activating || !target.trim() || !condition.trim() || (limitReached && !!user)} className="activate-btn">
              {activating ? 'Activating...' : !user ? 'Activate Agent (Sign In Required)' : 'Activate Agent'}
            </button>
            {pushPermission !== 'unsupported' && pushSupported() && (
              <button onClick={togglePush} className="flex items-center gap-2.5 text-xs font-mono text-[#b0b0b0] hover:text-[#999] transition-colors tracking-wide">
                {pushEnabled ? <Bell size={13} className="text-amber-500/70" /> : <BellOff size={13} />}
                <span className={pushEnabled ? 'text-amber-500/80' : ''}>{pushEnabled ? 'Notifications ON' : pushPermission === 'denied' ? 'Notifications blocked — enable in browser/device settings' : 'Allow notifications on this device'}</span>
              </button>
            )}
            {!user && (
              <p className="font-mono text-[12px] text-[#8a8a8a] tracking-wide">
                <button onClick={() => setShowAuthModal(true)} className="text-amber-500/50 hover:text-amber-400 transition-colors underline underline-offset-2">Sign in</button>{' '}
                to save missions between sessions.
              </p>
            )}
          </div>
        </section>

        {missions.length > 0 && (
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-5">
              <p className="font-mono text-[12px] text-amber-400/90 tracking-[0.3em] uppercase">— Active Missions —</p>
              <span className="font-mono text-[12px] text-green-400/80">{missions.length} running{user && isFinite(MISSION_LIMIT) && ` · ${Math.max(0, MISSION_LIMIT - missions.length)} slots remaining`}</span>
            </div>
            <div className="flex flex-col gap-3">
              {missions.map((m) => <MissionCard key={m.id} mission={m} findings={findings.filter((f) => f.mission_id === m.id)} onDeactivate={deactivateMission} />)}
            </div>
          </section>
        )}

        {missions.length === 0 && (
          <div className="text-center py-12 border border-dashed border-[#2e2e2e] rounded-sm">
            <p className="font-mono text-xs text-[#8a8a8a] tracking-widest uppercase">No active missions</p>
            <p className="font-mono text-[12px] text-[#777] mt-1">Deploy your first agent above.</p>
          </div>
        )}

        <section className="mt-16 pt-10 border-t border-[#222]">
          <p className="font-mono text-[12px] text-amber-400/90 tracking-[0.3em] uppercase mb-6">— Clearance Levels —</p>
          <div className={`grid grid-cols-1 gap-3 ${MODE.tiers.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
            {MODE.tiers.map((t) => (
              <div key={t.id} className={`border rounded-sm p-4 ${t.current ? 'border-amber-500/30 bg-amber-500/5' : 'border-[#2a2a2a] bg-[#1e1e1e]'}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className={`font-mono text-[11px] tracking-widest uppercase ${t.current ? 'text-amber-400' : 'text-[#c8c0b0]'}`}>{t.label}</span>
                  {t.current && <span className="font-mono text-[10px] text-amber-500/60 bg-amber-500/10 px-1.5 py-0.5 rounded-sm uppercase tracking-wider">Current</span>}
                </div>
                {t.trial && <div className="inline-block bg-green-500/10 border border-green-500/30 rounded-sm px-2 py-0.5 mb-2"><span className="font-mono text-[11px] text-green-400 tracking-widest uppercase">{t.trial}</span></div>}
                <p className="text-[#f5f0e8] font-semibold text-lg mb-1">{t.trial ? <span className="text-[#888] text-sm">then </span> : null}{t.price}</p>
                <p className="font-mono text-[12px] text-[#a0a0a0]">{t.missionsLabel}</p>
                <p className="font-mono text-[12px] text-[#8a8a8a]">{t.interval}</p>
                {t.trialNote && <p className="font-mono text-[11px] text-green-500/60 mt-2 leading-relaxed">{t.trialNote}</p>}
                {!t.current && <a href="https://go-i-agency.com" className="mt-3 block text-center font-mono text-[12px] text-amber-500/60 hover:text-amber-400 border border-amber-500/20 hover:border-amber-500/40 py-1.5 rounded-sm transition-colors uppercase tracking-widest">Upgrade</a>}
              </div>
            ))}
          </div>
        </section>
      </main>

      <SATicker />

      {showLeaveWarning && (
        <LeaveWarning
          onStay={() => setShowLeaveWarning(false)}
          onSave={() => {
            setShowLeaveWarning(false);
            setAuthModalMode('claim');
            setShowAuthModal(true);
          }}
          onLeave={() => {
            setShowLeaveWarning(false);
            void signOut();
          }}
        />
      )}
      {showAuthModal && <AuthModal initialMode={authModalMode} onClose={() => setShowAuthModal(false)} onSuccess={() => { setShowAuthModal(false); loadMissions(); }} />}
    </div>
  );
}

// ─── GIA Entry Form ───────────────────────────────────────────────────────────

interface GIAViewProps {
  boardId: string; setBoardId: (v: string) => void;
  target: string; setTarget: (v: string) => void;
  condition: string; setCondition: (v: string) => void;
  portfolioName: string; setPortfolioName: (v: string) => void;
  missions: SecretAgentMission[];
  findings: SecretAgentAlert[];
  activating: boolean; activateMission: () => void;
  deactivateMission: (id: string) => void;
  limitReached: boolean;
  user: { id: string; email?: string } | null;
  userTier: string;
  pushEnabled: boolean; pushPermission: string; togglePush: () => void;
  pushError: string | null;
  notifyPush: boolean; setNotifyPush: (v: boolean) => void;
  webhookUrl: string; setWebhookUrl: (v: string) => void;
  onSwitchMode: () => void;
  showAuthModal: boolean; setShowAuthModal: (v: boolean) => void;
  setShowSettingsModal: (v: boolean) => void;
  setShowPortfolioView: (v: boolean) => void;
  onLeave: () => void;
  loadMissions: () => void;
  refreshIntel: () => void;
  refreshing: boolean;
  selectedOption: WatchOption;
  MISSION_LIMIT: number;
}

function GIAView({
  boardId, setBoardId, target, setTarget, condition, setCondition,
  portfolioName, setPortfolioName, missions, findings, activating, activateMission,
  deactivateMission, limitReached, user, userTier,
  pushEnabled, pushPermission, togglePush, pushError,
  notifyPush, setNotifyPush,
  webhookUrl, setWebhookUrl,
  onSwitchMode, showAuthModal, setShowAuthModal,
  setShowSettingsModal, setShowPortfolioView, onLeave,
  loadMissions, refreshIntel, refreshing, selectedOption, MISSION_LIMIT,
}: GIAViewProps) {
  const [typeOpen, setTypeOpen] = useState(false);
  const typeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(event: MouseEvent) {
      if (!typeRef.current?.contains(event.target as Node)) setTypeOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const SelectedIcon = selectedOption.icon;
  const tierLimits = GIA_TIER_LIMITS[userTier] ?? GIA_TIER_LIMITS.operative;
  const activeMissions = missions.filter((m) => m.active);
  const portfolioNames = [...new Set(activeMissions.map((m) => m.portfolio_name).filter(Boolean))];
  const portfolioLimitReached = isFinite(tierLimits.portfolios) && portfolioNames.length >= tierLimits.portfolios;
  const missionLimitReached = isFinite(tierLimits.missions) && activeMissions.length >= tierLimits.missions;
  const newPortfolioIsNew = portfolioName.trim() && !portfolioNames.includes(portfolioName.trim());
  const portfolioBlocksDeploy = newPortfolioIsNew && portfolioLimitReached;

  // Group missions by portfolio for GIA view
  const portfolioGroups = missions.reduce<Record<string, SecretAgentMission[]>>((acc, m) => {
    const key = m.portfolio_name || '— Unassigned —';
    if (!acc[key]) acc[key] = [];
    acc[key].push(m);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-[#171c20] text-[#f5f0e8] flex flex-col font-['DM_Sans',sans-serif]">

      {/* Header */}
      <header className="border-b border-[#1a2a20] px-6 py-4 flex items-center justify-between max-w-5xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <span className="pulse-dot pulse-dot-emerald" />
          <div>
            <span className="font-mono font-bold text-sm tracking-[0.3em] uppercase text-white">
              GO INTELLIGENCE AGENCY
            </span>
            <span className="block font-mono text-[11px] text-emerald-400/80 tracking-[0.2em] uppercase mt-0.5">
              Intel. When you need it.
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onSwitchMode} className="text-[11px] font-mono uppercase tracking-widest text-emerald-300 hover:text-emerald-200 transition-colors border border-[#2a4a38] hover:border-emerald-500/40 px-3 py-1.5 rounded-sm">
            Operations Hub
          </button>
          {user && (
            <button
              onClick={() => setShowPortfolioView(true)}
              title="Manage portfolios"
              className="w-8 h-8 flex items-center justify-center rounded-full border border-[#2a4a38] hover:border-emerald-500/40 transition-colors text-[#aaa] hover:text-emerald-400"
            >
              <FolderKanban size={13} />
            </button>
          )}
          {user && (
            <button
              type="button"
              onClick={() => void refreshIntel()}
              disabled={refreshing}
              title="Refresh"
              className="w-8 h-8 flex items-center justify-center rounded-full border border-[#2a4a38] hover:border-emerald-500/40 transition-colors text-[#aaa] hover:text-emerald-400 disabled:opacity-40"
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            </button>
          )}
          {user && (
            <button
              onClick={() => setShowSettingsModal(true)}
              title="Settings"
              className="w-8 h-8 flex items-center justify-center rounded-full border border-[#2a4a38] hover:border-emerald-500/40 transition-colors text-[#aaa] hover:text-emerald-400"
            >
              <Settings size={13} />
            </button>
          )}
          {user ? (
            <div className="flex items-center gap-2">
              <span className="hidden sm:block font-mono text-[11px] text-[#888] max-w-[140px] truncate">{user.email}</span>
              <button onClick={onLeave} title={user.email ? 'Sign out' : 'Leave'} className="w-8 h-8 flex items-center justify-center rounded-full border border-[#2a4a38] hover:border-red-500/40 transition-colors text-[#aaa] hover:text-red-400">
                <LogOut size={13} />
              </button>
            </div>
          ) : (
            <button onClick={() => setShowAuthModal(true)} className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest text-[#666] hover:text-emerald-400 transition-colors border border-[#1a2a1a] hover:border-emerald-500/40 px-3 py-1.5 rounded-sm">
              <LogIn size={11} />Sign In
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">

          {/* ─── Deploy Form ─────────────────────────────────── */}
          <div className="lg:col-span-2">
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-px flex-1 bg-[#2a4a38]" />
                <span className="font-mono text-[11px] text-emerald-400 tracking-[0.25em] uppercase">
                  Deploy Operative
                </span>
                <div className="h-px flex-1 bg-[#2a4a38]" />
              </div>
              <h2 className="text-xl font-semibold text-white tracking-tight">
                What do you need an agent to watch?
              </h2>
              <p className="mt-1.5 text-sm text-[#c5d0ca] leading-relaxed">
                Pick what you are watching, then say when to brief you.
              </p>
            </div>

            <div className="mb-5" ref={typeRef}>
              <label className="gia-label">What are you watching?</label>
              <button
                type="button"
                onClick={() => setTypeOpen((open) => !open)}
                className="gia-field flex items-center gap-3 text-left"
              >
                <SelectedIcon size={16} className="text-emerald-400 flex-shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-[#f5f0e8]">{selectedOption.label}</span>
                  <span className="block font-mono text-[11px] text-[#8b9a93]">{selectedOption.sublabel}</span>
                </span>
                <ChevronDown size={16} className={`text-[#8b9a93] flex-shrink-0 transition-transform ${typeOpen ? 'rotate-180' : ''}`} />
              </button>
              {typeOpen && (
                <div className="mt-1.5 max-h-72 overflow-y-auto rounded-sm border border-[#4a5f56] bg-[#1c252b] shadow-xl">
                  {GIA_WATCH_OPTIONS.map(({ boardId: id, label, sublabel, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setBoardId(id);
                        setTypeOpen(false);
                      }}
                      className={`flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors ${
                        boardId === id
                          ? 'bg-emerald-500/15 text-emerald-200'
                          : 'text-[#e8eee9] hover:bg-[#243038]'
                      }`}
                    >
                      <Icon size={14} className="flex-shrink-0 mt-0.5" />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{label}</span>
                        <span className="block font-mono text-[11px] text-[#8b9a93]">{sublabel}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mb-4">
              <label className="gia-label">Target</label>
              <input
                type="text"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder={selectedOption.placeholder.target}
                className="gia-field"
              />
            </div>

            <div className="mb-4">
              <label className="gia-label">When should we brief you?</label>
              <input
                type="text"
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                placeholder={selectedOption.placeholder.condition}
                className="gia-field"
                onKeyDown={(e) => e.key === 'Enter' && activateMission()}
              />
            </div>

            <div className="mb-6">
              <label className="gia-label">
                Portfolio <span className="text-[#8b9a93] normal-case tracking-normal font-normal">— optional</span>
              </label>
              <div className="relative">
                <FolderOpen size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b9a93]" />
                <input
                  type="text"
                  value={portfolioName}
                  onChange={(e) => setPortfolioName(e.target.value)}
                  placeholder="Tech Sector Watch, Competitor Intel..."
                  className="gia-field !pl-9"
                />
              </div>
            </div>

            <div className="mb-6">
              <label className="gia-label">If this happens, notify me via</label>
              <button
                type="button"
                onClick={() => setNotifyPush(!notifyPush)}
                className={`flex items-center gap-2 px-4 py-2 rounded border font-mono text-[12px] tracking-wide transition-all ${
                  notifyPush
                    ? 'border-emerald-400 bg-emerald-500/15 text-emerald-200'
                    : 'border-[#4a5f56] bg-[#1c252b] text-[#c5d0ca] hover:border-emerald-500/50'
                }`}
              >
                <Bell size={12} />
                Notifications
              </button>
              <p className="font-mono text-[11px] text-[#8b9a93] mt-2 leading-relaxed">
                Push alert to devices where you have notifications turned on.{' '}
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(true)}
                  className="underline hover:text-[#c5d0ca] transition-colors"
                >
                  Manage in Settings
                </button>
              </p>
            </div>

            {/* Webhook URL (Agency tier only) */}
            {userTier === 'agency' && (
              <div className="mb-6">
                <label className="gia-label">
                  Webhook URL{' '}
                  <span className="text-[#8b9a93] normal-case tracking-normal font-normal">— optional, Agency</span>
                </label>
                <div className="relative">
                  <Webhook size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b9a93]" />
                  <input
                    type="url"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    placeholder="https://hooks.zapier.com/..."
                    className="gia-field !pl-9"
                  />
                </div>
                <p className="font-mono text-[11px] text-[#8b9a93] mt-1.5">GIA will POST the alert payload to this URL when the condition fires.</p>
              </div>
            )}

            {/* Tier limit warnings */}
            {missionLimitReached && user && (
              <div className="mb-4 bg-[#0a1a10] border border-emerald-500/20 rounded-sm px-4 py-3">
                <p className="font-mono text-[12px] text-emerald-500/70">
                  Operative limit reached ({tierLimits.missions}/{tierLimits.missions} for {userTier} tier).
                  Upgrade to deploy more.
                </p>
              </div>
            )}
            {portfolioBlocksDeploy && (
              <div className="mb-4 bg-amber-500/5 border border-amber-500/20 rounded-sm px-4 py-3">
                <p className="font-mono text-[12px] text-amber-500/70">
                  Portfolio limit reached ({tierLimits.portfolios} portfolios for {userTier} tier).
                  Use an existing portfolio or upgrade to create more.
                </p>
              </div>
            )}

            {/* Deploy button */}
            {!user ? (
              <button onClick={() => setShowAuthModal(true)} className="w-full bg-emerald-700 hover:bg-emerald-600 text-white font-mono text-[12px] tracking-[0.2em] uppercase py-4 rounded-sm transition-all flex items-center justify-center gap-2">
                <LogIn size={14} />Sign In to Deploy
              </button>
            ) : missionLimitReached || portfolioBlocksDeploy ? (
              <div className="w-full bg-[#0a1a10] border border-emerald-500/20 rounded-sm px-4 py-3 text-center">
                <p className="font-mono text-[12px] text-emerald-500/70">Operative limit reached — upgrade to deploy more.</p>
              </div>
            ) : (
              <button
                onClick={activateMission}
                disabled={activating || !target.trim() || !condition.trim()}
                className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:bg-[#0a1a10] disabled:text-[#2a4a32] text-white font-mono text-[12px] tracking-[0.2em] uppercase py-4 rounded-sm transition-all"
              >
                {activating ? 'Deploying...' : 'Deploy Operative'}
              </button>
            )}

            {/* Push toggle */}
            {pushPermission !== 'unsupported' && pushSupported() && (
              <button onClick={togglePush} className="mt-4 flex items-center gap-2.5 text-xs font-mono text-[#666] hover:text-[#999] transition-colors tracking-wide w-full">
                {pushEnabled ? <Bell size={12} className="text-emerald-500/70" /> : <BellOff size={12} />}
                <span className={pushEnabled ? 'text-emerald-500/70' : ''}>{pushEnabled ? 'Notifications on' : pushPermission === 'denied' ? 'Notifications blocked' : 'Enable notifications'}</span>
              </button>
            )}
            {pushError && (
              <p className="mt-2 font-mono text-[11px] text-red-400/90 leading-relaxed">{pushError}</p>
            )}
          </div>

          {/* ─── Active Operations ──────────────────────────── */}
          <div className="lg:col-span-3">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-px flex-1 bg-[#1a3325]" />
              <span className="font-mono text-[11px] text-emerald-400 tracking-[0.25em] uppercase">
                Active Operations
              </span>
              <span className="font-mono text-[11px] text-emerald-400/50">{missions.length} deployed{isFinite(MISSION_LIMIT) && ` · ${Math.max(0, MISSION_LIMIT - missions.length)} remaining`}</span>
              <div className="h-px flex-1 bg-[#1a3325]" />
            </div>

            {missions.length === 0 ? (
              <div className="text-center py-16 border border-dashed border-[#1a2a20] rounded-sm">
                <p className="font-mono text-[12px] text-[#c5d0ca] tracking-widest uppercase">No operatives deployed</p>
                <p className="font-mono text-[11px] text-[#8b9a93] mt-1">Tell us what to watch, then deploy.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                {Object.entries(portfolioGroups).map(([portfolio, ops]) => (
                  <div key={portfolio}>
                    <div className="flex items-center gap-2 mb-2">
                      <FolderOpen size={12} className="text-emerald-500/50" />
                      <span className="font-mono text-[11px] text-emerald-500/60 tracking-[0.2em] uppercase">{portfolio}</span>
                      <span className="font-mono text-[10px] text-[#444]">{ops.length} operative{ops.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex flex-col gap-2">
                      {ops.map((m) => <MissionCard key={m.id} mission={m} findings={findings.filter((f) => f.mission_id === m.id)} onDeactivate={deactivateMission} />)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Tier summary */}
            <div className="mt-10 border border-[#1a2a20] rounded-sm p-5">
              <p className="font-mono text-[11px] text-emerald-500/50 tracking-[0.25em] uppercase mb-4">Operational Clearance</p>
              <div className="flex flex-col gap-3">
                {MODE.tiers.map((t) => {
                  const resolvedTier = ['operative', 'director', 'agency'].includes(userTier) ? userTier : 'operative';
                  const isCurrent = resolvedTier === t.id;
                  return (
                  <div key={t.id} className={`flex items-center justify-between rounded border px-4 py-3 ${isCurrent ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-[#1a2a20] bg-[#0d0f12]'}`}>
                    <div>
                      <span className={`font-mono text-[12px] tracking-widest uppercase ${isCurrent ? 'text-emerald-400' : 'text-[#888]'}`}>{t.label}</span>
                      {t.trial && <span className="ml-2 font-mono text-[10px] text-green-400 bg-green-500/10 border border-green-500/20 rounded px-1.5 py-0.5">{t.trial}</span>}
                      {isCurrent && <span className="ml-2 font-mono text-[10px] text-emerald-500/50 uppercase tracking-wider">Current</span>}
                      <p className="font-mono text-[11px] text-[#666] mt-0.5">{t.missionsLabel} · {t.interval}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-white font-semibold">{t.price}</p>
                      {!isCurrent && t.stripeLink && !t.stripeLink.includes('REPLACE_WITH') && (
                        <div className="flex flex-col items-end gap-0.5">
                          <a href={t.stripeLink} target="_blank" rel="noopener noreferrer" className="font-mono text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors">
                            {t.isFree ? 'Subscribe' : 'Upgrade'} →
                          </a>
                          {t.stripeLinkAnnual && (
                            <a href={t.stripeLinkAnnual} target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] text-emerald-400/70 hover:text-emerald-300 transition-colors">
                              or {t.priceAnnual}
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* GIA footer ticker */}
      <div className="overflow-hidden border-t border-[#2a4a38] bg-[#14191d] py-2">
        <div className="cc-ticker inline-flex gap-16 text-xs font-mono text-emerald-400/70 tracking-widest uppercase">
          {['SECURE LINE ESTABLISHED', 'ALL OPERATIVES ACTIVE', 'DATA FEEDS NOMINAL', 'NO UNAUTHORIZED ACCESS', 'ENCRYPTED CHANNEL ACTIVE', 'HOURLY CHECKS RUNNING',
            'SECURE LINE ESTABLISHED', 'ALL OPERATIVES ACTIVE', 'DATA FEEDS NOMINAL', 'NO UNAUTHORIZED ACCESS', 'ENCRYPTED CHANNEL ACTIVE', 'HOURLY CHECKS RUNNING',
          ].map((item, i) => (
            <span key={i} className="flex items-center gap-3">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/40 inline-block" />
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
