import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

export function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:right-auto sm:max-w-sm z-50 flex items-center gap-2.5 rounded-2xl bg-slate-900 border border-amber-400/40 px-4 py-2.5 text-xs font-semibold text-white shadow-xl animate-bounce">
      <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
      <WifiOff size={15} className="text-amber-400 shrink-0" />
      <span className="leading-snug">
        Offline Mode &bull; Cached CMT Portal is active
      </span>
    </div>
  );
}
