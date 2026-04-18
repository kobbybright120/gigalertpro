import { useState, useRef, useEffect } from "react";
import { Lock } from "lucide-react";

export default function LockOverlay({ children, onUpgrade, onSeePlans }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setShowTooltip(false);
      }
    }
    if (showTooltip) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showTooltip]);

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onClick={() => setShowTooltip(true)}
    >
      {/* Blurred content */}
      <div
        className="pointer-events-none select-none"
        style={{ filter: "blur(6px)", WebkitFilter: "blur(6px)" }}
        aria-hidden="true"
      >
        {children}
      </div>

      {/* Lock icon overlay */}
      <div className="absolute inset-0 flex items-center justify-center bg-[#020617]/30 rounded-2xl cursor-pointer">
        <div className="w-10 h-10 rounded-xl bg-white/[0.08] border border-white/[0.1] flex items-center justify-center">
          <Lock className="w-5 h-5 text-gray-400" />
        </div>
      </div>

      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-56 sm:w-64 max-w-[calc(100vw-3rem)]">
          <div className="glass-card rounded-xl p-4 border border-[#00F0B5]/20 shadow-[0_0_30px_rgba(0,240,181,0.1)]">
            <p className="text-sm text-white font-semibold mb-3">
              Upgrade to Basic for $12/month to unlock this
            </p>
            <div className="flex gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onUpgrade?.();
                }}
                className="flex-1 py-2 bg-[#00F0B5] text-[#020617] text-xs font-bold rounded-lg hover:bg-[#00dba5] transition-all min-h-[44px]"
              >
                Upgrade Now
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSeePlans?.();
                }}
                className="flex-1 py-2 bg-white/[0.06] border border-white/[0.08] text-white text-xs font-bold rounded-lg hover:bg-white/[0.1] transition-all min-h-[44px]"
              >
                See All Plans
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
