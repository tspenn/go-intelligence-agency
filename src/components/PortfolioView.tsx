import { useState } from 'react';
import { FolderOpen, Pencil, Trash2, Check, X, AlertTriangle } from 'lucide-react';
import { supabase, type SecretAgentMission } from '../lib/supabase';

interface Props {
  missions: SecretAgentMission[];
  onClose: () => void;
  onMissionsChanged: () => void;
}

interface PortfolioGroup {
  name: string;
  missions: SecretAgentMission[];
  lastAlert: string | null;
}

export default function PortfolioView({ missions, onClose, onMissionsChanged }: Props) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Build portfolio groups from active missions
  const groups: PortfolioGroup[] = Object.entries(
    missions.reduce<Record<string, SecretAgentMission[]>>((acc, m) => {
      const key = m.portfolio_name || '— Unassigned —';
      if (!acc[key]) acc[key] = [];
      acc[key].push(m);
      return acc;
    }, {})
  ).map(([name, ms]) => ({
    name,
    missions: ms,
    lastAlert: ms
      .map((m) => m.last_alert_sent_at)
      .filter(Boolean)
      .sort()
      .reverse()[0] ?? null,
  }));

  async function startRename(portfolio: string) {
    setRenaming(portfolio);
    setRenameValue(portfolio === '— Unassigned —' ? '' : portfolio);
  }

  async function commitRename(oldName: string) {
    const newName = renameValue.trim();
    if (!newName || newName === oldName || oldName === '— Unassigned —') {
      setRenaming(null);
      return;
    }
    setSaving(true);
    await supabase
      .from('secret_agent_missions')
      .update({ portfolio_name: newName })
      .eq('portfolio_name', oldName);
    setSaving(false);
    setRenaming(null);
    onMissionsChanged();
  }

  async function deletePortfolio(name: string) {
    if (name === '— Unassigned —') {
      setConfirming(null);
      return;
    }
    setSaving(true);
    // Ungroup — set portfolio_name to null (non-destructive)
    await supabase
      .from('secret_agent_missions')
      .update({ portfolio_name: null })
      .eq('portfolio_name', name);
    setSaving(false);
    setConfirming(null);
    onMissionsChanged();
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="bg-[#0d1117] border border-[#1a3325] rounded-lg w-full max-w-xl shadow-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1a3325] flex-shrink-0">
          <div className="flex items-center gap-3">
            <FolderOpen size={15} className="text-emerald-400" />
            <div>
              <h2 className="font-mono font-bold text-white tracking-wide text-sm uppercase">Portfolio Manager</h2>
              <p className="font-mono text-[11px] text-emerald-500/50 tracking-widest mt-0.5">
                {groups.length} portfolio{groups.length !== 1 ? 's' : ''} · {missions.length} operative{missions.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded border border-[#1a3325] text-[#666] hover:text-white hover:border-[#2a4a32] transition-colors"
          >
            <X size={13} />
          </button>
        </div>

        {/* Portfolio list */}
        <div className="overflow-y-auto flex-1 divide-y divide-[#1a2a20]">
          {groups.length === 0 && (
            <div className="px-6 py-12 text-center">
              <p className="font-mono text-[12px] text-[#444] tracking-widest uppercase">No portfolios yet</p>
              <p className="font-mono text-[11px] text-[#333] mt-1">Deploy operatives with a portfolio name to get started.</p>
            </div>
          )}

          {groups.map((g) => (
            <div key={g.name} className="px-6 py-4">
              {confirming === g.name ? (
                <div className="flex items-center gap-3 bg-red-500/5 border border-red-500/20 rounded p-3">
                  <AlertTriangle size={13} className="text-red-400 flex-shrink-0" />
                  <p className="font-mono text-[11px] text-[#c0c0c0] flex-1">
                    Ungroup <span className="text-white">{g.name}</span>?{' '}
                    Operatives will stay active but lose their portfolio grouping.
                  </p>
                  <button
                    onClick={() => deletePortfolio(g.name)}
                    disabled={saving}
                    className="font-mono text-[11px] text-red-400 hover:text-red-300 transition-colors"
                  >
                    Ungroup
                  </button>
                  <button
                    onClick={() => setConfirming(null)}
                    className="font-mono text-[11px] text-[#666] hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-4 group">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <FolderOpen size={13} className="text-emerald-500/50 flex-shrink-0" />

                    {renaming === g.name ? (
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRename(g.name);
                            if (e.key === 'Escape') setRenaming(null);
                          }}
                          className="flex-1 bg-[#0a0e10] border border-emerald-500/30 rounded-sm px-2 py-1 text-[#f5f0e8] font-mono text-sm focus:outline-none"
                        />
                        <button
                          onClick={() => commitRename(g.name)}
                          disabled={saving}
                          className="text-emerald-400 hover:text-emerald-300 transition-colors"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={() => setRenaming(null)}
                          className="text-[#666] hover:text-white transition-colors"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <div className="min-w-0">
                        <p className="font-mono text-[13px] text-[#f5f0e8] truncate">{g.name}</p>
                        <p className="font-mono text-[11px] text-[#555] mt-0.5">
                          {g.missions.length} operative{g.missions.length !== 1 ? 's' : ''}
                          {g.lastAlert && (
                            <> · last alert {new Date(g.lastAlert).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</>
                          )}
                        </p>
                      </div>
                    )}
                  </div>

                  {renaming !== g.name && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      {g.name !== '— Unassigned —' && (
                        <>
                          <button
                            onClick={() => startRename(g.name)}
                            title="Rename portfolio"
                            className="w-7 h-7 flex items-center justify-center rounded border border-[#1a3325] text-[#555] hover:text-emerald-400 hover:border-emerald-500/30 transition-colors"
                          >
                            <Pencil size={11} />
                          </button>
                          <button
                            onClick={() => setConfirming(g.name)}
                            title="Ungroup portfolio"
                            className="w-7 h-7 flex items-center justify-center rounded border border-[#1a3325] text-[#555] hover:text-red-400 hover:border-red-500/30 transition-colors"
                          >
                            <Trash2 size={11} />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Operatives in this portfolio */}
              {g.missions.length > 0 && renaming !== g.name && confirming !== g.name && (
                <div className="mt-3 ml-5 flex flex-col gap-1.5">
                  {g.missions.map((m) => (
                    <div key={m.id} className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        m.status_message.startsWith('⚠') ? 'bg-amber-500' : 'bg-emerald-500/50'
                      }`} />
                      <span className="font-mono text-[11px] text-[#666] truncate">{m.codename}</span>
                      <span className="font-mono text-[10px] text-[#444] uppercase">{m.watch_type.replace('_', ' ')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="px-6 py-3 border-t border-[#1a2a20] flex-shrink-0">
          <p className="font-mono text-[10px] text-[#444] tracking-widest uppercase">
            Hover a portfolio row to rename or ungroup it
          </p>
        </div>
      </div>
    </div>
  );
}
