import { useState, useEffect, useRef } from 'react';
import {
  Shield, Eye, Lock, Radio, Target,
  ChevronRight, ChevronDown, Zap, Globe, FileText,
  AlertTriangle, CheckCircle, Clock, ArrowRight,
  Tag, Cloud, TrendingUp, LogOut, LogIn, Settings, RefreshCw,
  Bitcoin, Activity, Wind, Rss, Newspaper, ExternalLink, FolderOpen,
} from 'lucide-react';
import { supabase, type SecretAgentMission, type SecretAgentAlert, type WatchType, getWatchOpenUrl, getFindingOpenUrl } from '../lib/supabase';
import { signOut } from '../lib/auth';
import AuthModal from '../components/AuthModal';
import SettingsModal from '../components/SettingsModal';
import { GiaAssetsPanel, GiaCommsPanel } from '../components/GiaDesk';
import type { AuthState } from '../lib/auth';
import { MODE, isGIA, isSecretAgent } from '../lib/appMode';
import { isGuestSession, trialDaysRemaining } from '../lib/trial';
import LeaveWarning from '../components/LeaveWarning';
import type { GiaAsset, GiaNote } from '../lib/giaDesk';
import {
  addGiaNote,
  clearMissionReports,
  loadGiaAssets,
  loadGiaNotes,
  saveFindingAsAsset,
} from '../lib/giaDesk';

const WATCH_ICONS: Record<WatchType, typeof Eye> = {
  sale_price: Tag,
  severe_weather: Cloud,
  bank_balance: Shield,
  stock_price: TrendingUp,
  crypto_price: Bitcoin,
  earthquake: Activity,
  air_quality: Wind,
  website_change: Globe,
  rss_feed: Rss,
  news_keyword: Newspaper,
};

const TICKER_ITEMS = [
  'ENCRYPTED CHANNEL ACTIVE',
  'HOURLY CHECKS RUNNING',
  'SECURE LINE ESTABLISHED',
  'ALL AGENTS STANDING BY',
  'DATA FEEDS NOMINAL',
  'NO UNAUTHORIZED ACCESS',
];

function Ticker() {
  const items = [...TICKER_ITEMS, ...TICKER_ITEMS];
  return (
    <div className="overflow-hidden whitespace-nowrap border-y border-zinc-700 py-2 bg-[#1c2228]">
      <div className="cc-ticker inline-flex gap-16 text-xs font-mono text-zinc-400 tracking-widest uppercase">
        {items.map((item, i) => (
          <span key={i} className="flex items-center gap-3">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function standingReport(
  mission: SecretAgentMission,
  latestFinding?: SecretAgentAlert | null,
): { headline: string; detail: string } {
  if (latestFinding?.message) {
    return {
      headline: latestFinding.message,
      detail: latestFinding.triggered_at
        ? `Reported ${new Date(latestFinding.triggered_at).toLocaleString()}`
        : 'Latest report',
    };
  }
  if (mission.last_value) {
    return {
      headline: mission.last_value,
      detail: mission.last_checked_at
        ? `Last check ${new Date(mission.last_checked_at).toLocaleString()}`
        : 'Standing reading',
    };
  }
  if (mission.last_checked_at) {
    return {
      headline: mission.status_message || 'Checked. Nothing new to report.',
      detail: `Last check ${new Date(mission.last_checked_at).toLocaleString()}`,
    };
  }
  return {
    headline: 'Waiting on the first hourly check.',
    detail: 'This row keeps the last report — come back here to look again.',
  };
}

function StatusBadge({ active, hasAlert }: { active: boolean; hasAlert?: boolean }) {
  if (!active) {
    return (
      <span className="px-2 py-0.5 rounded text-[12px] font-semibold uppercase tracking-wider border bg-zinc-600/20 text-zinc-400 border-zinc-600/30">
        inactive
      </span>
    );
  }
  if (hasAlert) {
    return (
      <span className="px-2 py-0.5 rounded text-[12px] font-semibold uppercase tracking-wider border bg-amber-500/15 text-amber-400 border-amber-500/30">
        alert
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 rounded text-[12px] font-semibold uppercase tracking-wider border bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
      active
    </span>
  );
}

function FeedItem({ alert, missions }: { alert: SecretAgentAlert; missions: SecretAgentMission[] }) {
  const isAlert = alert.alert_type === 'condition_met';
  const isError = alert.alert_type === 'check_error';
  const time = new Date(alert.triggered_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const mission = missions.find((m) => m.id === alert.mission_id);
  const openUrl = getFindingOpenUrl(alert) ?? (mission ? getWatchOpenUrl(mission) : null);

  return (
    <div className="px-5 py-3 flex items-start gap-3 hover:bg-zinc-800/20 transition-colors">
      {isAlert
        ? <AlertTriangle size={13} className="flex-shrink-0 mt-0.5 text-amber-400" />
        : isError
          ? <AlertTriangle size={13} className="flex-shrink-0 mt-0.5 text-red-400" />
          : <CheckCircle size={13} className="flex-shrink-0 mt-0.5 text-emerald-400" />
      }
      <div className="flex-1 min-w-0">
        <p className="text-xs text-zinc-300 leading-snug truncate">{alert.message}</p>
        <div className="flex items-center gap-2 mt-1">
          <Clock size={9} className="text-zinc-600" />
          <span className="text-[12px] font-mono text-zinc-600">{time}</span>
          {openUrl && (
            <a
              href={openUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-400 hover:text-emerald-300 uppercase tracking-widest"
            >
              <ExternalLink size={10} />
              Open
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CommandCenter({
  auth,
  onSwitchMode,
}: {
  auth: AuthState;
  onSwitchMode: () => void;
}) {
  const [time, setTime] = useState(new Date());
  const [activeTab, setActiveTab] = useState('missions');
  const [missions, setMissions] = useState<SecretAgentMission[]>([]);
  const [alerts, setAlerts] = useState<SecretAgentAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'signin' | 'signup' | 'claim'>('signin');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showLeaveWarning, setShowLeaveWarning] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedMissionId, setExpandedMissionId] = useState<string | null>(null);
  const [deskView, setDeskView] = useState<'board' | 'assets' | 'comms'>('board');
  const [assets, setAssets] = useState<GiaAsset[]>([]);
  const [notes, setNotes] = useState<GiaNote[]>([]);
  const [rowNote, setRowNote] = useState('');
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  const user = auth.user;

  function jumpToBoard(tab?: string) {
    setDeskView('board');
    if (tab) setActiveTab(tab);
    boardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function jumpToDesk(view: 'board' | 'assets' | 'comms') {
    setDeskView(view);
    boardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (user) {
      loadData();
    } else {
      setMissions([]);
      setAlerts([]);
      setAssets([]);
      setNotes([]);
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    function onReturn() {
      if (document.visibilityState === 'visible') void loadData(true);
    }
    document.addEventListener('visibilitychange', onReturn);
    window.addEventListener('focus', onReturn);
    return () => {
      document.removeEventListener('visibilitychange', onReturn);
      window.removeEventListener('focus', onReturn);
    };
  }, [user]);

  async function loadData(silent = false) {
    if (!user) return;
    if (!silent) setLoading(true);
    const [missionsRes, alertsRes] = await Promise.all([
      supabase
        .from('secret_agent_missions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('secret_agent_alerts')
        .select('*')
        .eq('user_id', user.id)
        .order('triggered_at', { ascending: false })
        .limit(100),
    ]);
    if (missionsRes.data) setMissions(missionsRes.data as SecretAgentMission[]);
    if (alertsRes.data) setAlerts(alertsRes.data as SecretAgentAlert[]);
    if (isGIA) await loadDesk();
    if (!silent) setLoading(false);
  }

  async function loadDesk() {
    if (!user) return;
    const [nextAssets, nextNotes] = await Promise.all([
      loadGiaAssets(user.id),
      loadGiaNotes(user.id),
    ]);
    setAssets(nextAssets);
    setNotes(nextNotes);
  }

  async function refreshIntel() {
    if (!user || refreshing) return;
    setRefreshing(true);
    try {
      await loadData(true);
    } finally {
      setRefreshing(false);
    }
  }

  async function keepFinding(mission: SecretAgentMission, finding: SecretAgentAlert) {
    if (!user) return;
    setRowBusy(finding.id);
    await saveFindingAsAsset(user.id, mission, finding);
    await loadDesk();
    setRowBusy(null);
  }

  async function pinRowNote(mission: SecretAgentMission) {
    if (!user || !rowNote.trim()) return;
    setRowBusy(mission.id);
    const result = await addGiaNote(user.id, rowNote, mission);
    if (result.ok) setRowNote('');
    await loadDesk();
    setRowBusy(null);
  }

  async function clearReports(mission: SecretAgentMission) {
    if (!user) return;
    setRowBusy(`clear-${mission.id}`);
    await clearMissionReports(user.id, mission.id);
    await loadData(true);
    setRowBusy(null);
  }

  const utcTime = time.toUTCString().split(' ')[4];
  const utcDate = time.toUTCString().split(' ').slice(0, 4).join(' ');

  const activeMissions = missions.filter((m) => m.active);
  const alertMissions = missions.filter(
    (m) => m.active && (m.status_message.startsWith('⚠') || m.status_message.startsWith('✓'))
  );
  const conditionMetAlerts = alerts.filter((a) => a.alert_type === 'condition_met');
  const lastChecked = missions
    .filter((m) => m.last_checked_at)
    .sort((a, b) => new Date(b.last_checked_at!).getTime() - new Date(a.last_checked_at!).getTime())[0];

  const firedIds = new Set(
    alerts.filter((a) => a.alert_type === 'condition_met').map((a) => a.mission_id),
  );
  const tabMissions = activeTab === 'archive'
    ? missions.filter((m) => !m.active)
    : activeTab === 'fired'
      ? missions.filter((m) => firedIds.has(m.id))
      : activeTab === 'all'
        ? missions
        : activeMissions;

  return (
    <div className={`min-h-screen text-zinc-100 font-['Inter',sans-serif] flex flex-col ${isGIA ? 'bg-[#171c20]' : 'bg-zinc-950'}`}>

      {/* Header */}
      <header className={`border-b border-zinc-800 backdrop-blur-sm sticky top-0 z-50 ${isGIA ? 'bg-[#171c20]/95' : 'bg-zinc-950/95'}`}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-zinc-700 to-zinc-900 border border-zinc-700 flex items-center justify-center">
              <Shield size={16} className="text-emerald-400" />
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="font-['Space_Grotesk',sans-serif] font-bold text-base tracking-tight text-white">
                  {isGIA ? 'GIA' : 'MY SECRET AGENT'}
                </span>
                <span className="text-[12px] font-mono text-zinc-400 tracking-widest uppercase">
                  {isGIA ? 'your hub' : 'GIA'}
                </span>
              </div>
              {isGIA && (
                <p className="font-mono text-[10px] text-emerald-300/90 tracking-wide">
                  Go Intelligence Agency
                </p>
              )}
            </div>
          </div>

          {isGIA ? (
            <nav className="hidden md:flex items-center gap-5 text-sm text-zinc-300">
              <button
                type="button"
                onClick={() => jumpToDesk('board')}
                className={deskView === 'board' ? 'text-white' : 'hover:text-white transition-colors'}
              >
                The Board
              </button>
              <button
                type="button"
                onClick={() => jumpToDesk('assets')}
                className={deskView === 'assets' ? 'text-white' : 'hover:text-white transition-colors'}
              >
                Assets
              </button>
              <button
                type="button"
                onClick={() => jumpToDesk('comms')}
                className={deskView === 'comms' ? 'text-white' : 'hover:text-white transition-colors'}
              >
                Comms
              </button>
              <button type="button" onClick={onSwitchMode} className="hover:text-white transition-colors">
                Watch something
              </button>
            </nav>
          ) : (
            <div className="hidden md:flex items-center gap-6 text-sm text-zinc-400">
              <nav className="flex gap-5">
                {['Dashboard', 'Intel', 'Assets', 'Comms'].map((item) => (
                  <button key={item} className="hover:text-white transition-colors duration-150 tracking-wide">
                    {item}
                  </button>
                ))}
              </nav>
            </div>
          )}

          <div className="flex items-center gap-4">
            <button
              onClick={onSwitchMode}
              className="text-[12px] font-mono uppercase tracking-widest text-zinc-400 hover:text-emerald-400 transition-colors duration-150 border border-zinc-700 hover:border-emerald-500/30 px-2.5 py-1.5 rounded"
            >
              {isGIA ? 'Deploy Operative' : 'Agent Brief'}
            </button>
            <div className="text-right hidden sm:block">
              <p className="text-xs font-mono text-zinc-400">{utcTime} UTC</p>
              <p className="text-[12px] font-mono text-zinc-600">{utcDate}</p>
            </div>
            {user && (
              <button
                type="button"
                onClick={() => void refreshIntel()}
                disabled={refreshing}
                title="Refresh"
                className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-emerald-400 hover:border-emerald-500/30 transition-colors disabled:opacity-40"
              >
                <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
              </button>
            )}
            {user && (
              <button
                onClick={() => setShowSettingsModal(true)}
                title="Settings"
                className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-emerald-400 hover:border-emerald-500/30 transition-colors"
              >
                <Settings size={14} />
              </button>
            )}
            {user ? (
              <button
                onClick={() => {
                  if (isGuestSession(user)) setShowLeaveWarning(true);
                  else void signOut();
                }}
                title={isGuestSession(user) ? 'Leave' : 'Sign out'}
                className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-red-400 hover:border-red-500/30 transition-colors"
              >
                <LogOut size={14} />
              </button>
            ) : (
              <button
                onClick={() => {
                  setAuthModalMode('signin');
                  setShowAuthModal(true);
                }}
                className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-emerald-400 hover:border-emerald-500/30 transition-colors"
              >
                <LogIn size={14} />
              </button>
            )}
          </div>
        </div>
      </header>

      <Ticker />

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

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-zinc-800 min-h-[320px] md:min-h-[380px] flex items-center">
        {isGIA ? (
          <>
            <img
              src="/gia-header.jpg"
              alt=""
              className="absolute inset-0 w-full h-full object-cover object-[center_35%]"
            />
            <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-zinc-950 to-transparent" />
          </>
        ) : (
          <>
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(16,185,129,0.06)_0%,_transparent_60%)]" />
            <div className="absolute inset-0 cc-grid-bg opacity-30" />
          </>
        )}
        <div className="relative max-w-7xl mx-auto px-6 py-16 md:py-24 flex flex-col md:flex-row items-start md:items-center gap-10 w-full">
          <div className={isGIA ? 'flex-1 max-w-xl rounded-sm bg-black/30 px-5 py-6 md:px-7 md:py-7' : 'flex-1'}>
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3 py-1 text-xs text-emerald-400 font-mono tracking-wider mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {isGIA
                ? 'No install. Paste what you already check.'
                : user?.email
                  ? `AGENT: ${user.email.split('@')[0].toUpperCase()}`
                  : user
                    ? 'TRIAL OPERATIVE'
                    : 'SECURE CHANNEL ACTIVE'}
            </div>
            <h1 className="font-['Space_Grotesk',sans-serif] text-4xl md:text-5xl font-bold text-white leading-tight tracking-tight mb-4">
              {isGIA ? (
                <>Your <span className="text-emerald-400">Operations</span> Hub</>
              ) : (
                <>Mission<br /><span className="text-emerald-400">Command</span> Center</>
              )}
            </h1>
            <p className={`text-lg leading-relaxed max-w-lg mb-8 ${isGIA ? 'text-zinc-100' : 'text-zinc-400'}`}>
              {user
                ? isGIA
                  ? activeMissions.length === 0
                    ? 'Those tabs you keep refreshing? Drop them here. That is the whole jump in.'
                    : `${activeMissions.length} on the board — work and home, same list.`}
                  : `${activeMissions.length} active mission${activeMissions.length !== 1 ? 's' : ''} running. Your agents are watching silently in the background.`
                : isGIA
                  ? 'One hub for every signal you care about — not a single watch.'
                  : 'Sign in to view your missions, check intel, and receive alerts when conditions are met.'
              }
            </p>
            <div className="flex flex-col items-start gap-3">
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={onSwitchMode}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-all duration-200 hover:shadow-lg hover:shadow-emerald-500/20 active:scale-95"
                >
                  {isGIA ? 'Deploy Operative' : 'New Mission'}
                  <ArrowRight size={15} />
                </button>
                {!user && (
                  <button
                    onClick={() => setShowAuthModal(true)}
                    className="flex items-center gap-2 border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-all duration-200 active:scale-95"
                  >
                    <Lock size={15} />
                    Sign In
                  </button>
                )}
              </div>
              {isGIA && (
                <p className="text-sm text-zinc-100/90 leading-relaxed max-w-lg">
                  You already juggle pages. A competitor’s price. A restock. Tomorrow’s weather.
                  Friday’s score. Drop the URL or the name here. GIA checks them every hour and
                  pings you when something actually moves. No stack to learn.
                </p>
              )}
            </div>
          </div>

          {/* Live clock card */}
          <div className="w-full md:w-64 bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 backdrop-blur-sm flex-shrink-0">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-mono text-zinc-400 uppercase tracking-widest">Mission Clock</span>
              <Zap size={13} className="text-emerald-400" />
            </div>
            <p className="font-mono text-3xl font-light text-white tracking-widest mb-1">{utcTime}</p>
            <p className="font-mono text-xs text-zinc-500 mb-6">{utcDate} UTC</p>
            {lastChecked?.last_checked_at ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-500 font-mono uppercase tracking-wider text-[12px]">Last check</span>
                  <span className="font-mono text-zinc-300 text-[12px]">
                    {new Date(lastChecked.last_checked_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-500 font-mono uppercase tracking-wider text-[12px]">Active</span>
                  <span className="font-mono text-emerald-400 text-[12px]">{activeMissions.length} missions</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-500 font-mono uppercase tracking-wider text-[12px]">Alerts today</span>
                  <span className={`font-mono text-[12px] ${conditionMetAlerts.length > 0 ? 'text-amber-400' : 'text-zinc-400'}`}>
                    {conditionMetAlerts.length}
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {['New York', 'London', 'Tokyo'].map((city, i) => (
                  <div key={city} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <Globe size={11} className="text-zinc-600" />
                      <span className="text-zinc-400">{city}</span>
                    </div>
                    <span className="font-mono text-zinc-300">
                      {new Date(time.getTime() + [-5, 0, 9][i] * 3600000).toTimeString().slice(0, 5)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {isGIA && (
        <div className="md:hidden border-b border-zinc-800 bg-[#171c20]">
          <div className="max-w-7xl mx-auto px-4 py-2 flex gap-2 overflow-x-auto">
            {([
              { id: 'board', label: 'The Board' },
              { id: 'assets', label: 'Assets' },
              { id: 'comms', label: 'Comms' },
            ] as const).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => jumpToDesk(item.id)}
                className={`whitespace-nowrap px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider ${
                  deskView === item.id ? 'bg-zinc-700 text-white' : 'text-zinc-400'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      <section className="border-b border-zinc-800 bg-zinc-900/30">
        <div className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Active Missions', value: user ? String(activeMissions.length) : '—', icon: Target, delta: null },
            { label: 'Alerts Fired', value: user ? String(conditionMetAlerts.length) : '—', icon: AlertTriangle, delta: null },
            { label: 'Intel Reports', value: user ? String(alerts.length) : '—', icon: FileText, delta: null },
            { label: 'Status', value: alertMissions.length > 0 ? 'AMBER' : 'GREEN', icon: Eye, delta: null },
          ].map(({ label, value, icon: Icon }) => (
            <div
              key={label}
              className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-colors duration-200 group"
            >
              <div className="flex items-start justify-between mb-3">
                <Icon size={16} className="text-zinc-500 group-hover:text-emerald-400 transition-colors duration-200" />
              </div>
              <p className={`font-['Space_Grotesk',sans-serif] font-bold text-2xl mb-1 ${
                value === 'AMBER' ? 'text-amber-400' : value === 'GREEN' ? 'text-emerald-400' : 'text-white'
              }`}>
                {value}
              </p>
              <p className="text-xs text-zinc-400 uppercase tracking-wider">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Main content */}
      <main className="flex-1 max-w-7xl mx-auto px-6 py-8 w-full grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Missions panel / Assets / Comms */}
        <div ref={boardRef} className={`lg:col-span-2 ${isGIA && deskView !== 'board' ? '' : `rounded-2xl overflow-hidden border ${isGIA ? 'bg-[#1e262c] border-[#4a5f56]' : 'bg-zinc-900/40 border-zinc-800'}`}`}>
        {isGIA && deskView === 'assets' && user ? (
          <GiaAssetsPanel userId={user.id} assets={assets} missions={missions} onChange={() => void loadDesk()} />
        ) : isGIA && deskView === 'comms' && user ? (
          <GiaCommsPanel userId={user.id} notes={notes} missions={missions} onChange={() => void loadDesk()} />
        ) : isGIA && (deskView === 'assets' || deskView === 'comms') && !user ? (
          <div className="bg-[#1e262c] border border-[#4a5f56] rounded-2xl p-6 text-center">
            <p className="text-sm text-zinc-300">Sign in to use this drawer.</p>
          </div>
        ) : (
          <>
          <div className={`border-b px-6 py-4 ${isGIA ? 'border-[#4a5f56]' : 'border-zinc-800'}`}>
            {isGIA && (
              <div className="mb-3">
                <p className="text-sm font-semibold text-white">The Board</p>
                <p className="text-sm text-zinc-300 mt-0.5">
                  Every operative keeps a summary here. When a report lands, it stays on this row so you have a place to look again.
                </p>
              </div>
            )}
            <div className="flex items-center justify-between">
            <div className="flex gap-1">
              {(isGIA
                ? [
                    { id: 'missions', label: 'On the board' },
                    { id: 'fired', label: 'Reports' },
                    { id: 'archive', label: 'Archive' },
                  ]
                : [
                    { id: 'missions', label: 'Missions' },
                    { id: 'all', label: 'All' },
                    { id: 'archive', label: 'Archive' },
                  ]
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-colors duration-150 ${
                    activeTab === tab.id ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <button
              onClick={onSwitchMode}
              className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              {isGIA ? 'Deploy Operative' : 'New Mission'}
              <ChevronRight size={13} />
            </button>
            </div>
          </div>

          {loading ? (
            <div className="px-6 py-12 text-center">
              <p className="text-xs font-mono text-zinc-600 tracking-widest uppercase animate-pulse">Loading intel...</p>
            </div>
          ) : !user ? (
            <div className="px-6 py-12 text-center">
              <Lock size={24} className="text-zinc-700 mx-auto mb-4" />
              <p className="text-sm text-zinc-400 mb-3">Sign in to view your missions</p>
              <button
                onClick={() => setShowAuthModal(true)}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors mx-auto"
              >
                <LogIn size={13} />
                Sign In
              </button>
            </div>
          ) : tabMissions.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm text-zinc-300">
                {isGIA && activeTab === 'fired'
                  ? 'No reports yet. When an operative fires, the summary lives on this list.'
                  : isGIA
                    ? 'Nothing on the board yet. Deploy an operative — every report will sit on that row.'
                    : 'No missions in this view'}
              </p>
              <button
                onClick={onSwitchMode}
                className="mt-3 text-xs text-emerald-400 hover:text-emerald-300 transition-colors font-mono"
              >
                {isGIA ? '+ Deploy first operative →' : '+ Deploy first agent →'}
              </button>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/60">
              {tabMissions.map((m) => {
                const Icon = WATCH_ICONS[m.watch_type as WatchType] ?? Eye;
                const hasAlert = m.status_message.startsWith('⚠') || m.status_message.startsWith('✓');
                const openUrl = getWatchOpenUrl(m);
                const missionFindings = alerts.filter(
                  (a) => a.mission_id === m.id && a.alert_type === 'condition_met'
                );
                const latestFinding = missionFindings[0] ?? null;
                const report = standingReport(m, latestFinding);
                const expanded = expandedMissionId === m.id;
                return (
                  <div key={m.id} className={`divide-y ${isGIA ? 'divide-[#4a5f56]/40' : 'divide-zinc-800/40'}`}>
                    <div
                      className={`px-6 py-4 flex items-start gap-4 transition-colors duration-150 group cursor-pointer ${isGIA ? 'hover:bg-[#243038]' : 'hover:bg-zinc-800/30'}`}
                      onClick={() => {
                        setExpandedMissionId(expanded ? null : m.id);
                        if (!expanded) setRowNote('');
                      }}
                    >
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-2 ${hasAlert ? 'bg-amber-500 animate-pulse' : m.active ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
                      <Icon size={14} className={`flex-shrink-0 mt-1.5 ${isGIA ? 'text-emerald-400' : 'text-zinc-500'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <StatusBadge active={m.active} hasAlert={hasAlert} />
                          <span className="font-mono text-[12px] text-zinc-400 uppercase">{m.watch_type.replace('_', ' ')}</span>
                          {isGIA && m.portfolio_name && (
                            <span className="inline-flex items-center gap-1 font-mono text-[11px] text-emerald-300">
                              <FolderOpen size={10} />
                              {m.portfolio_name}
                            </span>
                          )}
                        </div>
                        <p className="text-base font-semibold text-white group-hover:text-emerald-100 transition-colors">
                          {isGIA ? m.target : m.codename}
                        </p>
                        {!isGIA && (
                          <p className="font-mono text-[12px] text-zinc-500 truncate mt-0.5">{m.status_message}</p>
                        )}
                        {isGIA && (
                          <div className="mt-2 rounded-md border border-[#4a5f56] bg-[#171c20] px-3 py-2.5">
                            <p className="text-[11px] font-mono uppercase tracking-widest text-emerald-300 mb-1">
                              Last report
                            </p>
                            <p className="text-sm text-zinc-100 leading-relaxed">{report.headline}</p>
                            <p className="text-[12px] text-zinc-400 mt-1">{report.detail}</p>
                            {m.last_value && latestFinding && (
                              <p className="text-[12px] text-zinc-400 mt-1">Standing reading: {m.last_value}</p>
                            )}
                          </div>
                        )}
                        <p className={`mt-2 font-mono text-[11px] uppercase tracking-widest ${isGIA ? 'text-emerald-300' : 'text-emerald-500/70'}`}>
                          {missionFindings.length} report{missionFindings.length === 1 ? '' : 's'} · tap for the list
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        {!isGIA && (
                          <p className="text-[12px] font-mono text-zinc-500 truncate max-w-[120px]">{m.target}</p>
                        )}
                        {m.last_checked_at && (
                          <p className={`text-[12px] font-mono mt-0.5 ${isGIA ? 'text-zinc-400' : 'text-zinc-500'}`}>
                            {new Date(m.last_checked_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                      </div>
                      {openUrl ? (
                        <a
                          href={openUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open source"
                          onClick={(e) => e.stopPropagation()}
                          className="flex-shrink-0 inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-widest text-emerald-400 hover:text-emerald-300 mt-1.5"
                        >
                          Open
                          <ExternalLink size={12} />
                        </a>
                      ) : (
                        <ChevronDown size={14} className={`text-zinc-400 flex-shrink-0 mt-1.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                      )}
                    </div>
                    {expanded && (
                      <div
                        className={`px-6 pb-4 pt-2 ${isGIA ? 'bg-[#171c20]' : 'bg-zinc-900/40'}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {missionFindings.length === 0 ? (
                          <p className="text-sm text-zinc-300">
                            No hits yet. The last reading still stays on this row after each hourly check.
                          </p>
                        ) : (
                          <div className="flex flex-col gap-3">
                            {missionFindings.map((finding, index) => {
                              const findingUrl = getFindingOpenUrl(finding, openUrl, index === 0);
                              const kept = assets.some((asset) => asset.alert_id === finding.id);
                              return (
                                <div key={finding.id} className="flex items-start gap-3">
                                  <div className="flex-1 min-w-0">
                                    {findingUrl ? (
                                      <a
                                        href={findingUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-sm text-emerald-300 underline underline-offset-2 inline-flex items-start gap-1"
                                      >
                                        <span>{finding.message}</span>
                                        <ExternalLink size={10} className="flex-shrink-0 mt-0.5" />
                                      </a>
                                    ) : (
                                      <p className="text-sm text-zinc-200">{finding.message}</p>
                                    )}
                                    <p className="text-[12px] text-zinc-400 mt-0.5">
                                      {new Date(finding.triggered_at).toLocaleString()}
                                    </p>
                                  </div>
                                  {isGIA && user && (
                                    <button
                                      type="button"
                                      disabled={kept || rowBusy === finding.id}
                                      onClick={() => void keepFinding(m, finding)}
                                      className="flex-shrink-0 text-[11px] font-mono uppercase tracking-widest text-emerald-300 hover:text-white disabled:text-zinc-500"
                                    >
                                      {kept ? 'Kept' : 'Keep'}
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {isGIA && user && (
                          <div className="mt-4 pt-3 border-t border-[#4a5f56]/50">
                            <p className="text-[11px] font-mono uppercase tracking-widest text-emerald-300 mb-2">
                              Note under {m.target}
                            </p>
                            <div className="flex flex-col sm:flex-row gap-2">
                              <input
                                value={expanded ? rowNote : ''}
                                onChange={(e) => setRowNote(e.target.value)}
                                placeholder="Call Fred. Buy on Monday…"
                                className="gia-field flex-1"
                              />
                              <button
                                type="button"
                                disabled={!rowNote.trim() || rowBusy === m.id}
                                onClick={() => void pinRowNote(m)}
                                className="text-[11px] font-mono uppercase tracking-widest text-emerald-300 hover:text-white border border-[#4a5f56] px-3 py-2 rounded"
                              >
                                Pin it
                              </button>
                            </div>
                            {notes.some((note) => note.mission_id === m.id) && (
                              <button
                                type="button"
                                onClick={() => jumpToDesk('comms')}
                                className="mt-2 text-[12px] text-zinc-400 hover:text-white"
                              >
                                {notes.filter((note) => note.mission_id === m.id).length} note
                                {notes.filter((note) => note.mission_id === m.id).length === 1 ? '' : 's'} in Comms
                              </button>
                            )}
                            {missionFindings.length > 0 && (
                              <button
                                type="button"
                                disabled={rowBusy === `clear-${m.id}`}
                                onClick={() => void clearReports(m)}
                                className="mt-3 block text-[11px] font-mono uppercase tracking-widest text-zinc-400 hover:text-amber-300"
                              >
                                Clear reports on this row
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="border-t border-zinc-800 px-6 py-3 flex items-center justify-between">
            <span className="text-xs text-zinc-600 font-mono">
              {user ? `${tabMissions.length} of ${missions.length} operations shown` : 'Sign in to view operations'}
            </span>
            <button
              onClick={loadData}
              className="text-xs text-zinc-400 hover:text-white transition-colors font-mono"
            >
              Refresh
            </button>
          </div>
          </>
        )}
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-6">

          {/* Live feed */}
          <div className={`rounded-2xl overflow-hidden flex-1 border ${isGIA ? 'bg-[#1e262c] border-[#4a5f56]' : 'bg-zinc-900/40 border-zinc-800'}`}>
            <div className={`border-b px-5 py-4 flex items-center gap-2 ${isGIA ? 'border-[#4a5f56]' : 'border-zinc-800'}`}>
              <Radio size={13} className="text-emerald-400 animate-pulse" />
              <span className="text-xs font-semibold uppercase tracking-widest text-zinc-200">Intel Feed</span>
            </div>
            {alerts.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-[12px] font-mono text-zinc-400 tracking-widest uppercase">
                  {user ? 'No recent intel' : 'Sign in to see feed'}
                </p>
                {isGIA && user && (
                  <p className="mt-2 text-sm text-zinc-300 leading-relaxed">
                    When something moves, it shows up here too. The lasting copy lives on The Board.
                  </p>
                )}
              </div>
            ) : (
              <div className="divide-y divide-zinc-700/50 max-h-[360px] overflow-y-auto">
                {alerts.map((alert) => (
                  <FeedItem key={alert.id} alert={alert} missions={missions} />
                ))}
              </div>
            )}
          </div>

          {isGIA && (
            <div className="bg-[#1e262c] border border-[#4a5f56] rounded-2xl p-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-emerald-300 mb-2">
                What GIA is
              </p>
              <p className="text-base font-semibold text-white mb-2">
                GIA means Go Intelligence Agency.
              </p>
              <p className="text-sm text-zinc-200 leading-relaxed mb-3">
                The name is the wink. The job is simple: you already juggle URLs. Drop them here —
                a supplier page and a school-delay storm, a client in the news and a restock,
                a market move and Friday’s game. Same check. You are one person. No stack.
              </p>
              <ol className="text-sm text-zinc-200 space-y-1.5 list-decimal list-inside">
                <li>Paste a page, a ticker, a name, a zip. That is an operative.</li>
                <li>We check the whole board every hour.</li>
                <li>When something moves, it stays on that row — and we ping this device.</li>
              </ol>
            </div>
          )}

          {/* Quick actions */}
          <div className={`rounded-2xl p-5 border ${isGIA ? 'bg-[#1e262c] border-[#4a5f56]' : 'bg-zinc-900/40 border-zinc-800'}`}>
            <p className={`text-xs font-semibold uppercase tracking-widest mb-4 ${isGIA ? 'text-zinc-200' : 'text-zinc-500'}`}>Quick Actions</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: isGIA ? 'Deploy Operative' : 'New Mission', icon: Target, action: onSwitchMode },
                { label: isGIA ? 'Reports' : 'Intel Log', icon: FileText, action: () => (isGIA ? jumpToBoard('fired') : setActiveTab('all')) },
                ...(isGIA
                  ? [
                      { label: 'Assets', icon: FolderOpen, action: () => jumpToDesk('assets') },
                      { label: 'Comms', icon: Radio, action: () => jumpToDesk('comms') },
                    ]
                  : []),
              ].map(({ label, icon: Icon, action }) => (
                <button
                  key={label}
                  onClick={action}
                  className={`flex flex-col items-center justify-center gap-2 p-3 rounded-xl border transition-all duration-150 group active:scale-95 ${
                    isGIA
                      ? 'border-[#4a5f56] text-zinc-200 hover:border-emerald-400 hover:bg-emerald-500/10 hover:text-white'
                      : 'border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:bg-zinc-800/40 hover:text-white'
                  }`}
                >
                  <Icon size={16} className="group-hover:text-emerald-400 transition-colors" />
                  <span className="text-[12px] font-semibold uppercase tracking-wider">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Pricing / Tier panel */}
          <div className={`rounded-2xl p-5 border ${isGIA ? 'bg-[#1e262c] border-[#4a5f56]' : 'bg-zinc-900/40 border-zinc-800'}`}>
            <p className={`text-xs font-semibold uppercase tracking-widest mb-1 ${isGIA ? 'text-zinc-200' : 'text-zinc-500'}`}>
              {isSecretAgent ? 'Upgrade Path' : 'How the desk grows'}
            </p>
            {isGIA && (
              <p className="text-sm text-zinc-300 leading-relaxed mb-4">
                Same hub at every level. What changes is how much of the board you can run.
              </p>
            )}
            <div className="flex flex-col gap-3">
              {MODE.tiers.map((t) => (
                <div
                  key={t.id}
                  className={`rounded-lg border p-3.5 ${
                    t.current
                      ? 'border-emerald-400/50 bg-emerald-500/10'
                      : isGIA
                        ? 'border-[#4a5f56] bg-[#171c20]'
                        : 'border-zinc-800 bg-zinc-900/40'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[12px] font-mono uppercase tracking-widest ${t.current ? 'text-emerald-300' : 'text-zinc-300'}`}>
                      {t.label}
                    </span>
                    {t.current && (
                      <span className="text-[12px] font-mono text-emerald-300 bg-emerald-500/15 px-1.5 py-0.5 rounded uppercase tracking-wider">
                        Current
                      </span>
                    )}
                  </div>

                  {t.trial && (
                    <div className="inline-block bg-green-500/15 border border-green-500/30 rounded px-1.5 py-0.5 mb-1">
                      <span className="text-[13px] font-mono text-green-300 uppercase tracking-wider">
                        {t.trial} free
                      </span>
                    </div>
                  )}

                  <p className="text-white font-semibold text-sm">
                    {t.trial ? <span className="text-zinc-400 text-[12px] font-normal">then </span> : null}
                    {t.price}
                  </p>
                  {t.summary ? (
                    <p className="text-sm text-zinc-200 mt-1.5 leading-relaxed">{t.summary}</p>
                  ) : (
                    <p className="text-[12px] font-mono text-zinc-400">{t.missionsLabel}</p>
                  )}

                  {isGIA && t.featureBullets && t.featureBullets.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {t.featureBullets.slice(0, 5).map((feat) => (
                        <li key={feat} className="text-[13px] text-zinc-300 leading-snug flex gap-2">
                          <span className="text-emerald-400 flex-shrink-0">·</span>
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {t.trialNote && (
                    <p className="text-[13px] font-mono text-emerald-300/80 mt-2 leading-relaxed">
                      {t.trialNote}
                    </p>
                  )}

                  {!t.current && (
                    t.isFree || isGuestSession(user) ? (
                      <button
                        type="button"
                        onClick={() => {
                          setAuthModalMode(isGuestSession(user) ? 'claim' : 'signin');
                          setShowAuthModal(true);
                        }}
                        className="mt-3 w-full text-center text-[12px] font-mono text-emerald-300 hover:text-white border border-emerald-400/40 hover:border-emerald-300 py-2 rounded uppercase tracking-widest transition-colors"
                      >
                        {isGuestSession(user) ? 'Save to upgrade' : 'Upgrade'}
                      </button>
                    ) : (
                      <a
                        href={isSecretAgent ? 'https://www.go-i-agency.com' : (t.stripeLink ?? '#')}
                        target={t.stripeLink ? '_blank' : undefined}
                        rel={t.stripeLink ? 'noopener noreferrer' : undefined}
                        className="mt-3 block text-center text-[12px] font-mono text-emerald-300 hover:text-white border border-emerald-400/40 hover:border-emerald-300 py-2 rounded uppercase tracking-widest transition-colors"
                      >
                        Upgrade
                      </a>
                    )
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className={`border-t border-zinc-800 ${isGIA ? 'bg-[#14191d]' : 'bg-zinc-950'}`}>
        <div className="max-w-7xl mx-auto px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Shield size={13} className="text-emerald-400" />
            <span className="text-xs font-mono text-zinc-300 tracking-wide">
              {isGIA ? 'GIA — Go Intelligence Agency' : `${MODE.name} — Classified`}
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs text-zinc-400 font-mono">
            <span>ENCRYPTION: AES-256</span>
            <span className="w-1 h-1 rounded-full bg-zinc-700" />
            <span>CHECKS: HOURLY</span>
            <span className="w-1 h-1 rounded-full bg-zinc-700" />
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              SECURE
            </span>
          </div>
        </div>
      </footer>

      {showAuthModal && (
        <AuthModal
          initialMode={authModalMode}
          onClose={() => setShowAuthModal(false)}
          onSuccess={() => {
            setShowAuthModal(false);
            loadData();
          }}
        />
      )}
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
      {showSettingsModal && user && (
        <SettingsModal
          userId={user.id}
          onClose={() => setShowSettingsModal(false)}
        />
      )}
    </div>
  );
}
