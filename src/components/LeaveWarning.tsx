import { AlertTriangle, X } from 'lucide-react';

interface LeaveWarningProps {
  onSave: () => void;
  onLeave: () => void;
  onStay: () => void;
}

/** Shown when a guest trial tries to leave without an email. */
export default function LeaveWarning({ onSave, onLeave, onStay }: LeaveWarningProps) {
  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onStay();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="leave-warning-title"
        className="relative w-full max-w-md bg-[#0d1117] border border-emerald-500/30 rounded-md shadow-2xl"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1a2a20]">
          <div className="flex items-center gap-2.5">
            <AlertTriangle size={14} className="text-amber-400" />
            <span className="font-mono text-[11px] text-emerald-400/80 tracking-[0.3em] uppercase">
              Save this trial
            </span>
          </div>
          <button
            type="button"
            onClick={onStay}
            aria-label="Stay"
            className="text-[#8a8a8a] hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-6">
          <h2 id="leave-warning-title" className="text-[#f5f0e8] font-semibold text-lg mb-2">
            Leaving without an email?
          </h2>
          <p className="font-mono text-[12px] text-[#b0b0b0] leading-relaxed mb-3">
            Your operatives stay saved on this browser. If you leave, sign out, or switch
            devices, you will not get back in unless you add an email first.
          </p>
          <p className="font-mono text-[12px] text-emerald-300/80 leading-relaxed mb-6">
            Sign up now to keep this trial on any phone or PC.
          </p>

          <div className="flex flex-col gap-2.5">
            <button type="button" onClick={onSave} className="deploy-btn w-full">
              Sign up to save
            </button>
            <button
              type="button"
              onClick={onLeave}
              className="w-full font-mono text-[11px] uppercase tracking-widest text-red-400/80 hover:text-red-300 border border-red-500/20 hover:border-red-500/40 rounded-sm py-2.5 transition-colors"
            >
              Leave anyway
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
