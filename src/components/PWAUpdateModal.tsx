import { useEffect, useState } from "react";
import { pwaUpdateService } from "../services/pwaUpdateService";

export function PWAUpdateModal() {
  const [hasUpdate, setHasUpdate] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  useEffect(() => {
    const unsubscribe = pwaUpdateService.subscribe((updateReady) => {
      setHasUpdate(updateReady);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleUpdateNow = async () => {
    setIsApplying(true);
    setHasUpdate(false);
    try {
      await pwaUpdateService.applyUpdate();
    } catch {
      window.location.reload();
    }
    // Instant fallback to ensure the app quickly reloads
    setTimeout(() => {
      window.location.reload();
    }, 200);
  };

  if (!hasUpdate) return null;

  // Full Update Prompt Modal - Clean Light / White Theme, No Icons, No Emojis
  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 md:p-6 bg-white/80 backdrop-blur-md transition-all animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="update-heading"
    >
      <div className="w-full max-w-sm sm:max-w-md bg-white rounded-2xl sm:rounded-3xl shadow-[0_16px_50px_rgba(15,23,42,0.12)] border border-slate-200 overflow-hidden flex flex-col">
        
        {/* White Theme Header */}
        <div className="bg-white px-5 sm:px-6 py-4 sm:py-5 border-b border-slate-200 shrink-0">
          <div>
            <h2 id="update-heading" className="text-base sm:text-lg font-black text-slate-900 tracking-tight uppercase">
              APP UPDATE AVAILABLE
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Covai Meter Taxi
            </p>
          </div>
        </div>

        {/* Content Body - Short Clean Text */}
        <div className="bg-white p-5 sm:p-6 text-slate-800">
          <p className="text-sm sm:text-base font-semibold text-slate-900 leading-snug">
            Update the app to the latest version.
          </p>
        </div>

        {/* White Theme Footer Actions */}
        <div className="bg-white p-4 sm:p-5 border-t border-slate-200 shrink-0">
          <button
            type="button"
            onClick={handleUpdateNow}
            disabled={isApplying}
            className="w-full py-3 px-6 rounded-xl bg-slate-950 hover:bg-slate-800 active:scale-98 text-white text-sm font-black transition-all shadow-sm cursor-pointer text-center disabled:opacity-70"
          >
            {isApplying ? "Updating..." : "Update Now"}
          </button>
        </div>

      </div>
    </div>
  );
}
