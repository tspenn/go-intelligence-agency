import { useState, useEffect } from 'react';
import { X, Phone, MessageSquare, Save, Loader2 } from 'lucide-react';
import { supabase, type UserProfile } from '../lib/supabase';

interface Props {
  userId: string;
  onClose: () => void;
  onSaved?: (profile: UserProfile) => void;
}

export default function SettingsModal({ userId, onClose, onSaved }: Props) {
  const [phone, setPhone] = useState('');
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    const { data } = await supabase
      .from('profiles')
      .select('phone, sms_enabled, tier, id')
      .eq('id', userId)
      .maybeSingle();
    if (data) {
      setPhone(data.phone ?? '');
      setSmsEnabled(data.sms_enabled ?? false);
    }
    setLoading(false);
  }

  async function saveSettings() {
    setSaving(true);
    const cleanPhone = phone.trim() || null;
    const { data } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        phone: cleanPhone,
        sms_enabled: smsEnabled,
        updated_at: new Date().toISOString(),
      })
      .select('id, tier, phone, sms_enabled')
      .maybeSingle();

    setSaving(false);
    setSaved(true);
    if (data && onSaved) onSaved(data as UserProfile);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="bg-[#0d1117] border border-[#1a3325] rounded-lg w-full max-w-md shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1a3325]">
          <div>
            <h2 className="font-mono font-bold text-white tracking-wide text-sm uppercase">Agent Settings</h2>
            <p className="font-mono text-[11px] text-emerald-500/50 tracking-widest mt-0.5">Notification preferences</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded border border-[#1a3325] text-[#666] hover:text-white hover:border-[#2a4a32] transition-colors"
          >
            <X size={13} />
          </button>
        </div>

        {loading ? (
          <div className="px-6 py-12 text-center">
            <Loader2 size={18} className="text-emerald-400 animate-spin mx-auto" />
          </div>
        ) : (
          <div className="px-6 py-6 space-y-6">

            {/* Phone number */}
            <div>
              <label className="font-mono text-[11px] text-[#888] tracking-[0.2em] uppercase block mb-2">
                Phone Number{' '}
                <span className="text-[#555] normal-case tracking-normal font-normal">— for SMS alerts</span>
              </label>
              <div className="relative">
                <Phone size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#444]" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 555 000 0000"
                  className="w-full bg-[#0a0e10] border border-[#1e2e24] rounded-sm pl-9 pr-4 py-3 text-[#f5f0e8] font-mono text-sm focus:outline-none focus:border-emerald-500/40 transition-colors placeholder-[#333]"
                />
              </div>
              <p className="font-mono text-[10px] text-[#555] mt-1.5">Include country code. E.g. +1 for US/Canada.</p>
            </div>

            {/* SMS master toggle */}
            <div className="flex items-start justify-between gap-4 p-4 border border-[#1e2e24] rounded-sm bg-[#0a0e10]">
              <div className="flex items-start gap-3">
                <MessageSquare size={15} className="text-emerald-400/70 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm text-[#f5f0e8] font-semibold">SMS Alerts</p>
                  <p className="font-mono text-[11px] text-[#666] mt-0.5 leading-relaxed">
                    Receive a text message when an operative fires.
                    Enabled per-mission at deploy time.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSmsEnabled((v) => !v)}
                aria-label="Toggle SMS alerts"
                className={`relative flex-shrink-0 w-11 h-6 rounded-full border transition-all duration-200 ${
                  smsEnabled ? 'bg-emerald-600 border-emerald-500' : 'bg-[#1a1a1a] border-[#333]'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${
                    smsEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Save */}
            <button
              onClick={saveSettings}
              disabled={saving}
              className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-60 text-white font-mono text-[12px] tracking-[0.2em] uppercase py-3 rounded-sm transition-all flex items-center justify-center gap-2"
            >
              {saving ? (
                <><Loader2 size={13} className="animate-spin" />Saving...</>
              ) : saved ? (
                'Saved ✓'
              ) : (
                <><Save size={13} />Save Settings</>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
