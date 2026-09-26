import { useState, useRef, type FormEvent, type CSSProperties, type ChangeEvent } from "react";
import { 
  Eye, 
  EyeOff, 
  AlertCircle, 
  ChevronRight
} from "lucide-react";
import { 
  loginVendor, 
  type VendorSession 
} from "../services/vendorAuth";

interface LoginViewProps {
  onLoginSuccess: (session: VendorSession) => void;
  initialErrorMessage?: string | null;
}

export function LoginView({ onLoginSuccess, initialErrorMessage }: LoginViewProps) {
  const [vendorId, setVendorId] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(initialErrorMessage || null);
  const pinInputRef = useRef<HTMLInputElement>(null);

  const handlePinChange = (e: ChangeEvent<HTMLInputElement>) => {
    const numericOnly = e.target.value.replace(/\D/g, "").slice(0, 4);
    setPin(numericOnly);
    // Auto-hide mobile virtual keyboard as soon as 4th digit is typed
    if (numericOnly.length === 4) {
      e.target.blur();
      pinInputRef.current?.blur();
    }
  };

  const handleLogin = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage(null);

    if (!vendorId.trim()) {
      setErrorMessage("Please enter your Vendor ID.");
      return;
    }
    if (!pin.trim() || pin.length < 4) {
      setErrorMessage("Please enter your 4-digit PIN.");
      return;
    }

    setIsLoading(true);
    try {
      const res = await loginVendor(vendorId, pin);
      if (res.success && res.session) {
        onLoginSuccess(res.session);
      } else {
        setErrorMessage(res.message || "Login failed. Check your Vendor ID & PIN.");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "An unexpected error occurred during login.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen min-h-[100dvh] bg-[#FDCB58] text-slate-900 font-sans antialiased flex flex-col justify-between md:justify-center items-center p-0 md:p-6 lg:p-8 selection:bg-amber-400 selection:text-slate-950 overflow-y-auto">
      
      {/* Container - Handles full responsiveness across mobile, tablet, and desktop */}
      <div className="w-full max-w-md lg:max-w-lg flex flex-col justify-between md:justify-center min-h-[100dvh] md:min-h-0 py-0 md:py-6">
        
        {/* Brand Header */}
        <header className="pt-20 sm:pt-28 md:pt-0 pb-12 sm:pb-16 md:pb-6 px-6 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 sm:w-18 sm:h-18 md:w-20 md:h-20 rounded-2xl sm:rounded-3xl bg-slate-950 text-[#FDCB58] flex items-center justify-center font-black text-2xl sm:text-3xl shadow-xl mb-4 sm:mb-5 transition-transform hover:scale-105 select-none">
            CMT
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-slate-950 tracking-tight text-center">
            Vendor Portal
          </h1>
        </header>

        {/* Main Login Form Card */}
        <main className="w-full flex-1 md:flex-initial flex flex-col justify-end md:justify-center">
          <div className="bg-white rounded-t-[40px] sm:rounded-t-[48px] md:rounded-3xl pt-8 sm:pt-10 md:pt-8 pb-10 sm:pb-12 md:pb-8 px-6 sm:px-8 md:px-10 shadow-[0_-12px_30px_rgba(0,0,0,0.06)] md:shadow-2xl md:border md:border-amber-300/40 w-full transition-all">
            
            <div className="space-y-6">
              
              {/* Header inside card */}
              <div className="border-b border-slate-100 pb-3">
                <h2 className="text-lg sm:text-xl font-black text-slate-900">
                  Vendor Sign In
                </h2>
              </div>

              {/* Error Message Banner */}
              {errorMessage && (
                <div className="p-3.5 sm:p-4 rounded-2xl bg-rose-50 border border-rose-200/90 text-rose-800 text-xs sm:text-sm font-semibold flex items-start gap-2.5 animate-fadeIn">
                  <AlertCircle size={18} className="shrink-0 text-rose-600 mt-0.5" />
                  <div className="flex-1 leading-snug">
                    {errorMessage}
                  </div>
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-4 sm:space-y-5" autoComplete="off" spellCheck="false">
                
                {/* Vendor ID Input */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider pl-1">
                    Vendor ID
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      name="vendor-code-id"
                      id="vendor-code-id"
                      value={vendorId}
                      onChange={(e) => setVendorId(e.target.value.toUpperCase())}
                      placeholder=""
                      autoCapitalize="characters"
                      autoCorrect="off"
                      spellCheck="false"
                      autoComplete="off"
                      data-lpignore="true"
                      data-form-type="other"
                      className="w-full bg-slate-50/90 hover:bg-slate-100/70 focus:bg-white border border-slate-200/90 focus:border-amber-400 focus:ring-4 focus:ring-amber-400/20 rounded-2xl px-4 py-3 sm:py-3.5 text-base font-mono font-bold text-slate-900 outline-none transition-all placeholder:font-sans placeholder:font-normal placeholder:text-slate-400 shadow-2xs"
                    />
                  </div>
                </div>

                {/* PIN Input - Disables Google Password Manager warnings & popups */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between pl-1">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Security PIN
                    </label>
                    <span className="text-[10px] sm:text-xs font-semibold text-slate-400">
                      4 digits
                    </span>
                  </div>
                  <div className="relative flex items-center">
                    <input
                      ref={pinInputRef}
                      type="tel"
                      inputMode="numeric"
                      name="vendor-pin-code"
                      id="vendor-pin-code"
                      pattern="[0-9]*"
                      maxLength={4}
                      value={pin}
                      onChange={handlePinChange}
                      placeholder="••••"
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck="false"
                      data-lpignore="true"
                      data-form-type="other"
                      style={{
                        WebkitTextSecurity: showPin ? "none" : "disc",
                      } as CSSProperties}
                      className="w-full bg-slate-50/90 hover:bg-slate-100/70 focus:bg-white border border-slate-200/90 focus:border-amber-400 focus:ring-4 focus:ring-amber-400/20 rounded-2xl px-4 pr-12 py-3 sm:py-3.5 text-base font-mono font-black tracking-widest text-slate-900 outline-none transition-all placeholder:font-sans placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-400 shadow-2xs"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin(!showPin)}
                      className="absolute right-3 p-2 text-slate-400 hover:text-slate-700 rounded-xl transition-colors cursor-pointer"
                      title={showPin ? "Hide PIN" : "Show PIN"}
                    >
                      {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {/* Login Button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-12 sm:h-13 bg-slate-950 hover:bg-slate-800 active:scale-98 text-amber-400 font-black text-sm sm:text-base rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-4 sm:mt-5"
                >
                  <span>{isLoading ? "Signing In..." : "Sign In"}</span>
                  <ChevronRight size={18} className="text-amber-400/70" />
                </button>
              </form>

            </div>

          </div>
        </main>

      </div>

    </div>
  );
}
