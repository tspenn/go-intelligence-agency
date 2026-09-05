import { useState } from 'react';
import { Bookmark, ChevronDown, ExternalLink, Trash2 } from 'lucide-react';
import type { SecretAgentMission } from '../lib/supabase';
import type { GiaAsset, GiaNote } from '../lib/giaDesk';
import {
  addGiaNote,
  addManualAsset,
  deleteGiaAsset,
  deleteGiaNote,
  groupByOperative,
  operativeLabel,
} from '../lib/giaDesk';

function OperativePicker({
  missions,
  value,
  onChange,
}: {
  missions: SecretAgentMission[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="gia-field"
    >
      <option value="">Which operative?</option>
      {missions.map((mission) => (
        <option key={mission.id} value={mission.id}>
          {mission.target}
        </option>
      ))}
    </select>
  );
}

export function GiaAssetsPanel({
  userId,
  assets,
  missions,
  onChange,
}: {
  userId: string;
  assets: GiaAsset[];
  missions: SecretAgentMission[];
  onChange: () => void;
}) {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [missionId, setMissionId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const groups = groupByOperative(assets, (asset) =>
    operativeLabel(asset.mission_id, asset.operative_title ?? asset.note, missions),
  );

  async function addManual() {
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    const mission = missions.find((m) => m.id === missionId) ?? null;
    const result = await addManualAsset(userId, title, url, mission);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setTitle('');
    setUrl('');
    onChange();
  }

  return (
    <div className="bg-[#1e262c] border border-[#4a5f56] rounded-2xl p-6">
      <h2 className="text-lg font-semibold text-white">Assets</h2>
      <p className="text-sm text-zinc-300 mt-1 mb-5 leading-relaxed">
        Keep a URL, an article, or a development under the operative it belongs to.
        Clear the noise on The Board — what you save here stays.
      </p>

      <div className="grid gap-2 sm:grid-cols-2 mb-6">
        <OperativePicker missions={missions} value={missionId} onChange={setMissionId} />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What is this?"
          className="gia-field"
        />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://… (optional)"
          className="gia-field sm:col-span-2"
        />
        <button
          type="button"
          disabled={busy || !title.trim()}
          onClick={() => void addManual()}
          className="deploy-btn !py-3 !px-4 sm:col-span-2"
        >
          Keep
        </button>
      </div>
      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

      {groups.length === 0 ? (
        <p className="text-sm text-zinc-400">
          Nothing kept yet. On The Board, open a report and tap Keep.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {groups.map((group) => {
            const open = openKey === group.key;
            return (
              <li key={group.key} className="border border-[#4a5f56] rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpenKey(open ? null : group.key)}
                  className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-[#243038]"
                >
                  <Bookmark size={14} className="text-emerald-400 flex-shrink-0" />
                  <span className="flex-1 font-semibold text-white">{group.title}</span>
                  <span className="text-[12px] text-zinc-400">
                    {group.items.length} kept
                  </span>
                  <ChevronDown
                    size={14}
                    className={`text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`}
                  />
                </button>
                {open && (
                  <ul className="border-t border-[#4a5f56]/60 bg-[#171c20] px-4 py-3 flex flex-col gap-3">
                    {group.items.map((asset) => (
                      <li key={asset.id} className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white leading-relaxed">{asset.title}</p>
                          {asset.url && (
                            <a
                              href={asset.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[12px] text-emerald-300 mt-1"
                            >
                              Open <ExternalLink size={10} />
                            </a>
                          )}
                        </div>
                        <button
                          type="button"
                          title="Remove"
                          onClick={() => void deleteGiaAsset(asset.id).then(onChange)}
                          className="text-zinc-500 hover:text-red-400"
                        >
                          <Trash2 size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function GiaCommsPanel({
  userId,
  notes,
  missions,
  onChange,
}: {
  userId: string;
  notes: GiaNote[];
  missions: SecretAgentMission[];
  onChange: () => void;
}) {
  const [body, setBody] = useState('');
  const [missionId, setMissionId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const groups = groupByOperative(notes, (note) =>
    operativeLabel(note.mission_id, note.operative_title, missions),
  );

  async function add() {
    const mission = missions.find((m) => m.id === missionId);
    if (!body.trim() || !mission) {
      setError('Pick an operative, then write the note.');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await addGiaNote(userId, body, mission);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setBody('');
    setOpenKey(mission.id);
    onChange();
  }

  return (
    <div className="bg-[#1e262c] border border-[#4a5f56] rounded-2xl p-6">
      <h2 className="text-lg font-semibold text-white">Comms</h2>
      <p className="text-sm text-zinc-300 mt-1 mb-5 leading-relaxed">
        A note to yourself, filed under that operative. Call Fred about Saturday’s game.
        Buy the stock on Monday. Not a chat — the next thing, under the right title.
      </p>

      <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto] mb-6">
        <OperativePicker missions={missions} value={missionId} onChange={setMissionId} />
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void add()}
          placeholder="Note to self…"
          className="gia-field"
        />
        <button
          type="button"
          disabled={busy || !body.trim() || !missionId}
          onClick={() => void add()}
          className="deploy-btn !py-3 !px-5"
        >
          Pin it
        </button>
      </div>
      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

      {groups.length === 0 ? (
        <p className="text-sm text-zinc-400">
          No notes yet. Pick an operative and write one line — or add it from that row on The Board.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {groups.map((group) => {
            const open = openKey === group.key;
            return (
              <li key={group.key} className="border border-[#4a5f56] rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpenKey(open ? null : group.key)}
                  className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-[#243038]"
                >
                  <span className="flex-1 font-semibold text-white">{group.title}</span>
                  <span className="text-[12px] text-zinc-400">
                    {group.items.length} note{group.items.length === 1 ? '' : 's'}
                  </span>
                  <ChevronDown
                    size={14}
                    className={`text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`}
                  />
                </button>
                {open && (
                  <ul className="border-t border-[#4a5f56]/60 bg-[#171c20] px-4 py-3 flex flex-col gap-3">
                    {group.items.map((note) => (
                      <li key={note.id} className="flex items-start gap-3">
                        <p className="flex-1 text-sm text-white leading-relaxed">{note.body}</p>
                        <span className="text-[11px] text-zinc-500 whitespace-nowrap">
                          {new Date(note.created_at).toLocaleDateString()}
                        </span>
                        <button
                          type="button"
                          title="Done"
                          onClick={() => void deleteGiaNote(note.id).then(onChange)}
                          className="text-zinc-500 hover:text-red-400"
                        >
                          <Trash2 size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
