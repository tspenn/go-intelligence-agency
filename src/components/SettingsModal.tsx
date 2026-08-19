import { useState, useEffect } from 'react';
import { X, Bell, BellOff, Loader2 } from 'lucide-react';
import {
  pushSupported,
  getPushPermission,
  enablePushNotifications,
  disablePushNotifications,
  restoreAndSyncPush,
  type PushPermissionState,
} from '../lib/pushNotifications';

interface Props {
  userId: string;
  onClose: () => void;
  /** Fired when this device’s push subscription is enabled or disabled */
  onPushChange?: (enabled: boolean) => void;
}

export default function SettingsModal({ userId, onClose, onPushChange }: Props) {
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [permission, setPermission] = useState<PushPermissionState>('default');
  const [pushError, setPushError] = useState<string | null>(null);

  useEffect(() => {
    void loadPushState();
  }, []);

  async function loadPushState() {
    const perm = await getPushPermission();
    setPermission(perm);

    if (pushSupported()) {
      const restored = await restoreAndSyncPush(userId);
      setPushEnabled(restored.enabled);
      setPushError(restored.error);
    } else {
      setPushEnabled(false);
    }
    setLoading(false);
  }

  async function toggleNotifications() {
    if (!pushSupported()) return;
    setToggling(true);
    setPushError(null);

    if (pushEnabled) {
      await disablePushNotifications(userId);
      setPushEnabled(false);
      setPermission(await getPushPermission());
      onPushChange?.(false);
    } else {
      const result = await enablePushNotifications(userId);
      const perm = await getPushPermission();
      setPermission(perm);
      setPushEnabled(result.ok);
      setPushError(result.ok ? null : result.error);
      onPushChange?.(result.ok);
    }

    setToggling(false);
  }

  const unsupported = permission === 'unsupported' || !pushSupported();
  const denied = permission === 'denied';

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="bg-[#0d1117] border border-[#1a3325] rounded-lg w-full max-w-md shadow-2xl">

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
          <div className="px-6 py-6 space-y-5">

            <div className="flex items-start justify-between gap-4 p-4 border border-[#1e2e24] rounded-sm bg-[#0a0e10]">
              <div className="flex items-start gap-3">
                {pushEnabled ? (
                  <Bell size={15} className="text-emerald-400/70 mt-0.5 flex-shrink-0" />
                ) : (
                  <BellOff size={15} className="text-[#555] mt-0.5 flex-shrink-0" />
                )}
                <div>
                  <p className="text-sm text-[#f5f0e8] font-semibold">Alert notifications</p>
                  <p className="font-mono text-[11px] text-[#666] mt-0.5 leading-relaxed">
                    Ping this device when an operative fires. You must have notifications
                    turned on on your device/devices.
                  </p>
                </div>
              </div>
              <button
                onClick={() => void toggleNotifications()}
                disabled={toggling || unsupported || denied}
                aria-label="Toggle alert notifications"
                className={`relative flex-shrink-0 w-11 h-6 rounded-full border transition-all duration-200 disabled:opacity-40 ${
                  pushEnabled ? 'bg-emerald-600 border-emerald-500' : 'bg-[#1a1a1a] border-[#333]'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${
                    pushEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {unsupported && (
              <p className="font-mono text-[11px] text-amber-500/80 leading-relaxed">
                Notifications are not supported in this browser. Use Chrome, Edge, Firefox,
                or Safari on a supported device, and keep this site installed or open so
                alerts can reach you.
              </p>
            )}

            {denied && (
              <p className="font-mono text-[11px] text-amber-500/80 leading-relaxed">
                Notifications are blocked for this site. Open your browser or device settings,
                allow notifications for {typeof window !== 'undefined' ? window.location.host : 'this site'},
                then return here and turn alert notifications on.
              </p>
            )}

            {!unsupported && !denied && !pushEnabled && (
              <p className="font-mono text-[11px] text-[#555] leading-relaxed">
                Turn the toggle on and accept the browser permission prompt. Enable notifications
                on every device where you want to receive alerts.
              </p>
            )}

            {pushError && (
              <p className="font-mono text-[11px] text-red-400/90 leading-relaxed">{pushError}</p>
            )}

            {pushEnabled && (
              <p className="font-mono text-[11px] text-emerald-500/60 leading-relaxed">
                This device will receive alert notifications. Repeat on other devices if you
                want Pings there too.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
