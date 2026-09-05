import { supabase } from './supabase';
import type { SecretAgentAlert, SecretAgentMission } from './supabase';
import { getFindingOpenUrl, getWatchOpenUrl } from './supabase';

export interface GiaAsset {
  id: string;
  user_id: string;
  mission_id: string | null;
  alert_id: string | null;
  title: string;
  url: string | null;
  note: string | null;
  operative_title: string | null;
  source: string;
  created_at: string;
}

export interface GiaNote {
  id: string;
  user_id: string;
  mission_id: string | null;
  operative_title: string;
  body: string;
  created_at: string;
}

export function operativeLabel(
  missionId: string | null | undefined,
  storedTitle: string | null | undefined,
  missions: SecretAgentMission[],
): string {
  const live = missionId ? missions.find((m) => m.id === missionId) : null;
  return (live?.target || storedTitle || 'Kept by you').trim();
}

export function groupByOperative<T extends { mission_id: string | null; created_at: string }>(
  items: T[],
  titleFor: (item: T) => string,
): { key: string; title: string; items: T[] }[] {
  const groups = new Map<string, { title: string; items: T[] }>();
  for (const item of items) {
    const key = item.mission_id ?? `loose:${titleFor(item)}`;
    const title = titleFor(item);
    const existing = groups.get(key);
    if (existing) existing.items.push(item);
    else groups.set(key, { title, items: [item] });
  }
  return [...groups.entries()]
    .map(([key, group]) => ({ key, ...group }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

export async function loadGiaAssets(userId: string): Promise<GiaAsset[]> {
  const { data } = await supabase
    .from('gia_assets')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  return (data ?? []) as GiaAsset[];
}

export async function loadGiaNotes(userId: string): Promise<GiaNote[]> {
  const { data } = await supabase
    .from('gia_notes')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  return (data ?? []) as GiaNote[];
}

export async function saveFindingAsAsset(
  userId: string,
  mission: SecretAgentMission,
  finding: SecretAgentAlert,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const url = getFindingOpenUrl(finding, getWatchOpenUrl(mission), true);
  const { error } = await supabase.from('gia_assets').insert({
    user_id: userId,
    mission_id: mission.id,
    alert_id: finding.id,
    title: finding.message,
    url,
    note: mission.target,
    operative_title: mission.target,
    source: 'finding',
  });
  if (error) {
    if (error.code === '23505') return { ok: true };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function addManualAsset(
  userId: string,
  title: string,
  url: string,
  mission: SecretAgentMission | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from('gia_assets').insert({
    user_id: userId,
    mission_id: mission?.id ?? null,
    title: title.trim(),
    url: url.trim() || null,
    note: mission?.target ?? null,
    operative_title: mission?.target ?? null,
    source: 'manual',
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteGiaAsset(id: string) {
  await supabase.from('gia_assets').delete().eq('id', id);
}

export async function clearMissionReports(userId: string, missionId: string) {
  await supabase
    .from('secret_agent_alerts')
    .delete()
    .eq('user_id', userId)
    .eq('mission_id', missionId)
    .eq('alert_type', 'condition_met');
}

export async function addGiaNote(
  userId: string,
  body: string,
  mission: SecretAgentMission,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from('gia_notes').insert({
    user_id: userId,
    mission_id: mission.id,
    operative_title: mission.target,
    body: body.trim(),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteGiaNote(id: string) {
  await supabase.from('gia_notes').delete().eq('id', id);
}
