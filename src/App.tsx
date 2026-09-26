import { useState, useEffect, lazy, Suspense, type ChangeEvent, type ClipboardEvent } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Phone, 
  Send, 
  Clock, 
  Lock, 
  Download, 
  Check, 
  Copy, 
  MessageSquare, 
  X, 
  Calendar, 
  CalendarDays,
  ShieldCheck,
  ClipboardPaste,
  Sparkles,
  Receipt,
  Settings,
  KeyRound,
  LogOut
} from "lucide-react";
import { LoginView } from "./components/LoginView";
import { OfflineIndicator } from "./components/OfflineIndicator";
import type { CompanyProfile } from "./types/billing";
import { getStoredCompanyProfile } from "./utils/storage";
import { 
  getStoredSession, 
  verifyDailySession, 
  clearSession, 
  logoutVendor,
  type VendorSession 
} from "./services/vendorAuth";

// Code-split heavy views for sub-second initial load on Vercel
const BillingView = lazy(() => import("./components/BillingView").then(m => ({ default: m.BillingView })));
const SettingsView = lazy(() => import("./components/SettingsView").then(m => ({ default: m.SettingsView })));

// IST Time Details interface
interface ISTInfo {
  hour24: number; // 0 to 23
  minute: number;
  second: number;
  dayString: string;
  monthString: string;
  yearString: string;
  weekdayString: string;
  timeString12: string;
  timeString24: string;
  hourWindow: string; // e.g., "14:00 - 14:59 IST"
  secondsRemainingInHour: number;
  percentageElapsedInHour: number;
}

// Compute accurate Asia/Kolkata date & time parts
function getISTNow(): ISTInfo {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "short",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
    hourCycle: "h23"
  });

  const parts = formatter.formatToParts(now);
  const map: Record<string, string> = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }

  let hour24 = parseInt(map.hour ?? "0", 10);
  if (isNaN(hour24) || hour24 === 24) hour24 = 0;

  const minute = parseInt(map.minute ?? "0", 10) || 0;
  const second = parseInt(map.second ?? "0", 10) || 0;
  const hourPadded = String(hour24).padStart(2, "0");
  const minPadded = String(minute).padStart(2, "0");
  const secPadded = String(second).padStart(2, "0");

  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const ampm = hour24 >= 12 ? "PM" : "AM";
  const timeString12 = `${hour12}:${minPadded}:${secPadded} ${ampm}`;
  const timeString24 = `${hourPadded}:${minPadded}:${secPadded}`;
  const hourWindow = `${hourPadded}:00 - ${hourPadded}:59 IST`;
  const secondsRemainingInHour = (59 - minute) * 60 + (59 - second);
  const totalSecondsInHour = 3600;
  const percentageElapsedInHour = Math.min(100, Math.max(0, ((totalSecondsInHour - secondsRemainingInHour) / totalSecondsInHour) * 100));

  return {
    hour24,
    minute,
    second,
    dayString: map.day ?? "",
    monthString: map.month ?? "",
    yearString: map.year ?? "",
    weekdayString: map.weekday ?? "",
    timeString12,
    timeString24,
    hourWindow,
    secondsRemainingInHour,
    percentageElapsedInHour
  };
}

/**
 * Universal Mobile Sanitizer:
 * Handles any input or pasted format:
 * - "+91 6385765142" -> "6385765142"
 * - "+916385765142"  -> "6385765142"
 * - "+91-63857-65142"-> "6385765142"
 * - "06385765142"    -> "6385765142"
 * - "91 6385765142"  -> "6385765142"
 * - "63857 65142"    -> "6385765142"
 * - "6385765142"     -> "6385765142"
 */
export function extractTenDigitMobile(raw: string): string {
  if (!raw) return "";
  let trimmed = raw.trim();

  // If user pasted with explicit international prefix
  if (trimmed.startsWith("+91") || trimmed.startsWith("+ 91")) {
    trimmed = trimmed.replace(/^\+\s*91[\s-]*/, "");
  } else if (trimmed.startsWith("+")) {
    trimmed = trimmed.replace(/^\+/, "");
  }

  // Remove any non-digits
  let digits = trimmed.replace(/\D/g, "");

  // If digits start with 91 and has 12 or more digits
  if (digits.startsWith("91") && digits.length >= 12) {
    digits = digits.slice(2);
  } 
  // If digits start with leading 0 trunk prefix
  else if (digits.startsWith("0") && digits.length >= 11) {
    digits = digits.slice(1);
  }

  // Return strictly 10 digits
  return digits.slice(0, 10);
}

export default function App() {
  // Mobile Number State
  const [mobileNumber, setMobileNumber] = useState("");
  
  // Mode Selection: "instant" | "advance"
  const [activeTab, setActiveTab] = useState<"instant" | "advance">("instant");

  // Advance Booking Settings
  const getTomorrowStr = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const y = tomorrow.getFullYear();
    const m = String(tomorrow.getMonth() + 1).padStart(2, "0");
    const d = String(tomorrow.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };
  const [advanceDate, setAdvanceDate] = useState(getTomorrowStr());
  const [advanceHour, setAdvanceHour] = useState<number>(9);

  // Real-time IST clock state
  const [istTime, setIstTime] = useState<ISTInfo>(getISTNow());

  // Dispatch feedback states
  const [smsTriggered, setSmsTriggered] = useState(false);
  const [whatsappTriggered, setWhatsappTriggered] = useState(false);

  // Keep IST clock updated every second
  useEffect(() => {
    const interval = setInterval(() => {
      setIstTime(getISTNow());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Top level page navigation: "otp" | "billing" | "settings"
  const [activePage, setActivePage] = useState<"otp" | "billing" | "settings">("otp");

  // Company Profile loaded from localStorage
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile>(getStoredCompanyProfile);

  // Vendor Session State
  const [session, setSession] = useState<VendorSession | null>(getStoredSession);
  const [authError, setAuthError] = useState<string | null>(null);

  // Daily 1-time check on app launch (Skip read/write if already checked today)
  useEffect(() => {
    if (!session) return;
    let isMounted = true;

    verifyDailySession(session).then((res) => {
      if (!isMounted) return;
      if (!res.valid) {
        setAuthError(res.message || "This account was logged in on another device. Only 1 device is allowed at a time.");
        setSession(null);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [session]);

  const handleLoginSuccess = (newSession: VendorSession) => {
    setSession(newSession);
    setAuthError(null);
  };

  const handleLogout = async () => {
    await logoutVendor(session);
    setSession(null);
  };

  // Mobile input handlers
  const handleMobileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const cleaned = extractTenDigitMobile(e.target.value);
    setMobileNumber(cleaned);
  };

  const handleMobilePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text");
    const cleaned = extractTenDigitMobile(pasted);
    setMobileNumber(cleaned);
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const cleaned = extractTenDigitMobile(text);
      if (cleaned) {
        setMobileNumber(cleaned);
      }
    } catch {
      // ignore
    }
  };

  // Algorithm Computation
  const cleanDigits = extractTenDigitMobile(mobileNumber);
  const hasMinFourDigits = cleanDigits.length >= 4;

  // 1. First 4 digits
  const firstFourDigits = hasMinFourDigits ? cleanDigits.slice(0, 4) : "";

  // 2. Reverse the 4 digits
  const reversedFirstFour = hasMinFourDigits 
    ? firstFourDigits.split("").reverse().join("") 
    : "";

  // 3. Active hour (0-23 in Asia/Kolkata)
  const activeHour = activeTab === "instant" ? istTime.hour24 : advanceHour;

  // 4. (Reversed[i] + Hour) % 10
  const calculationSteps = hasMinFourDigits ? reversedFirstFour.split("").map((char, index) => {
    const originalDigit = parseInt(char, 10);
    const sum = originalDigit + activeHour;
    const modulo = sum % 10;
    return {
      index,
      originalDigit,
      hour: activeHour,
      sum,
      modulo
    };
  }) : [];

  // 5. Final 4-digit OTP
  const generatedOtp = calculationSteps.length === 4 
    ? calculationSteps.map(step => step.modulo).join("") 
    : "";

  // Reset notifications on parameter changes
  useEffect(() => {
    if (smsTriggered) setSmsTriggered(false);
    if (whatsappTriggered) setWhatsappTriggered(false);
  }, [cleanDigits, activeHour, activeTab, advanceDate]);

  // Format hour for human reading
  const formatHourDisplay = (h: number) => {
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    const ampm = h >= 12 ? "PM" : "AM";
    const padded = String(h).padStart(2, "0");
    return `${String(hour12).padStart(2, "0")}:00 ${ampm} (${padded}:00)`;
  };

  // Format date display
  const getFormattedBookingDate = () => {
    if (!advanceDate) return "";
    try {
      const parts = advanceDate.split("-");
      if (parts.length === 3) {
        const [y, m, d] = parts.map(Number);
        const dateObj = new Date(y, m - 1, d);
        return dateObj.toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric"
        });
      }
      return advanceDate;
    } catch {
      return advanceDate;
    }
  };

  // Prefilled Message according to specification
  const getOtpMessage = () => {
    return `Your Taxi OTP is: ${generatedOtp}\nYour booking is CONFIRMED!\nShare this OTP with the driver to begin your ride.`;
  };

  // Native SMS
  const handleSendOtp = () => {
    if (!hasMinFourDigits) return;
    const smsMessage = getOtpMessage();
    const encodedSmsBody = encodeURIComponent(smsMessage);
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const smsUrl = isIOS 
      ? `sms:${cleanDigits}&body=${encodedSmsBody}`
      : `sms:${cleanDigits}?body=${encodedSmsBody}`;

    setSmsTriggered(true);
    window.location.href = smsUrl;
  };

  // WhatsApp
  const handleSendWhatsApp = () => {
    if (!hasMinFourDigits) return;
    const whatsappMessage = getOtpMessage();
    const encodedMessage = encodeURIComponent(whatsappMessage);
    let target = cleanDigits;
    if (target.length === 10) {
      target = `91${target}`;
    }
    const whatsappUrl = `https://api.whatsapp.com/send?phone=${target}&text=${encodedMessage}`;
    setWhatsappTriggered(true);
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      window.location.href = whatsappUrl;
    } else {
      window.open(whatsappUrl, "_blank", "noopener,noreferrer");
    }
  };

  // Copy Actions
  const handleCopyOnlyOtp = () => {
    if (!generatedOtp) return;
    navigator.clipboard.writeText(generatedOtp);
  };

  const handleCopyOtpMessage = () => {
    const msg = getOtpMessage();
    navigator.clipboard.writeText(msg);
  };

  // If not logged in, render the Vendor Login page
  if (!session) {
    return (
      <LoginView
        onLoginSuccess={handleLoginSuccess}
        initialErrorMessage={authError}
      />
    );
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-[#FDCB58] text-slate-900 font-sans antialiased flex flex-col selection:bg-amber-400 selection:text-slate-950">
      
      {/* App Top Navigation Bar */}
      <header className="sticky top-0 z-40 backdrop-blur-md border-b bg-[#FDCB58] border-amber-400/50">
        <div className="max-w-4xl mx-auto px-4 h-14 sm:h-16 flex items-center justify-center relative">
          
          {/* Brand Mark - Fixed Default App Name: CMT (Pinned Left) */}
          <div className="absolute left-4 flex items-center">
            <button 
              type="button" 
              onClick={() => setActivePage("otp")}
              className="flex items-center text-left cursor-pointer select-none group"
              title="CMT App Home"
            >
              <div className="w-8 h-8 rounded-xl bg-slate-950 flex items-center justify-center text-[#FDCB58] font-black text-xs tracking-wider shadow-xs group-hover:scale-105 transition-transform">
                CMT
              </div>
            </button>
          </div>

          {/* Navigation Tabs - Perfectly Centered in All Devices */}
          <nav className="flex items-center space-x-1 p-1 rounded-xl bg-black/10 mx-auto">
            <button
              type="button"
              onClick={() => setActivePage("otp")}
              className={`px-3 sm:px-4 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                activePage === "otp"
                  ? "bg-white text-slate-950 shadow-xs"
                  : "text-slate-800 hover:text-slate-950"
              }`}
            >
              <span>OTP</span>
            </button>

            <button
              type="button"
              onClick={() => setActivePage("billing")}
              className={`px-3 sm:px-4 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                activePage === "billing"
                  ? "bg-white text-slate-950 shadow-xs"
                  : "text-slate-800 hover:text-slate-950"
              }`}
            >
              <span>Billing</span>
            </button>

            <button
              type="button"
              onClick={() => setActivePage("settings")}
              className={`px-3 sm:px-4 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                activePage === "settings"
                  ? "bg-white text-slate-950 shadow-xs"
                  : "text-slate-800 hover:text-slate-950"
              }`}
              title="Company Settings"
            >
              <span>Settings</span>
            </button>
          </nav>
        </div>
      </header>

      {/* App Body Container */}
      <main className="flex-1 w-full p-0 flex flex-col">
        
        {/* Render Settings Page */}
        {activePage === "settings" && (
          <Suspense fallback={
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-slate-800">
              <div className="w-8 h-8 border-3 border-slate-900 border-t-amber-400 rounded-full animate-spin mb-3" />
              <span className="text-xs font-bold text-slate-600">Loading Settings...</span>
            </div>
          }>
            <SettingsView
              profile={companyProfile}
              onProfileUpdated={setCompanyProfile}
              vendorSession={session}
              onLogout={handleLogout}
            />
          </Suspense>
        )}

        {/* Render Billing Page */}
        {activePage === "billing" && (
          <Suspense fallback={
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-slate-800">
              <div className="w-8 h-8 border-3 border-slate-900 border-t-amber-400 rounded-full animate-spin mb-3" />
              <span className="text-xs font-bold text-slate-600">Loading Billing Engine...</span>
            </div>
          }>
            <BillingView
              companyProfile={companyProfile}
              onNavigateToSettings={() => setActivePage("settings")}
            />
          </Suspense>
        )}

        {/* Render OTP Page */}
        {activePage === "otp" && (
          <div className="flex-1 flex flex-col bg-[#FDCB58] w-full">
            
            {/* Top Yellow Half - Generous clean breathing room */}
            <div className="py-7 sm:py-9 px-5 sm:px-6 text-center text-slate-950 relative max-w-xl lg:max-w-2xl mx-auto w-full">
              
              {/* Instant vs Advance Mode Switcher Pill */}
              <div className="inline-flex p-1.5 bg-black/10 rounded-2xl text-xs font-bold text-slate-950 backdrop-blur-xs shadow-inner/10">
                <button
                  type="button"
                  onClick={() => setActiveTab("instant")}
                  className={`px-4 sm:px-5 py-2 rounded-xl transition-all cursor-pointer ${
                    activeTab === "instant" 
                      ? "bg-white text-slate-950 shadow-xs" 
                      : "text-slate-900/75 hover:text-slate-950"
                  }`}
                >
                  Instant Ride
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("advance")}
                  className={`px-4 sm:px-5 py-2 rounded-xl transition-all cursor-pointer ${
                    activeTab === "advance" 
                      ? "bg-white text-slate-950 shadow-xs" 
                      : "text-slate-900/75 hover:text-slate-950"
                  }`}
                >
                  Advance Booking
                </button>
              </div>

            </div>

            {/* Bottom White Section - Sweeps across full width */}
            <div className="flex-1 bg-white rounded-tl-[48px] sm:rounded-tl-[64px] pt-8 sm:pt-10 pb-20 px-4 sm:px-8 md:px-12 shadow-[0_-12px_30px_rgba(0,0,0,0.03)] w-full max-w-full overflow-hidden">
              <div className="max-w-xl lg:max-w-2xl mx-auto space-y-7 w-full">
                
                {/* 1. Mobile Number Input Card */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider pl-1">
                    Customer Mobile Number
                  </label>
                  <div className="bg-slate-50 hover:bg-white focus-within:bg-white rounded-2xl p-2 border border-slate-200/90 focus-within:border-amber-400 focus-within:ring-4 focus-within:ring-amber-400/20 transition-all flex items-center space-x-2 shadow-xs">
                    <span className="font-mono font-bold text-slate-700 text-sm pl-3 pr-2.5 border-r border-slate-200 select-none">
                      +91
                    </span>
                    <input
                      type="tel"
                      value={cleanDigits}
                      onChange={handleMobileChange}
                      onPaste={handleMobilePaste}
                      placeholder=""
                      className="w-full bg-transparent px-1.5 py-2 text-base font-mono font-bold text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:outline-none tracking-wider"
                      autoComplete="off"
                    />
                    {mobileNumber ? (
                      <button
                        type="button"
                        onClick={() => setMobileNumber("")}
                        className="p-2 text-slate-400 hover:text-slate-700 rounded-xl transition-colors cursor-pointer"
                        title="Clear number"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handlePasteClipboard}
                        className="text-xs font-bold bg-amber-100 hover:bg-amber-200 text-slate-900 px-3.5 py-1.5 rounded-xl transition-all cursor-pointer shrink-0 shadow-2xs active:scale-95"
                        title="Paste from clipboard"
                      >
                        Paste
                      </button>
                    )}
                    {cleanDigits.length === 10 && (
                      <div className="pr-2.5 text-emerald-600 shrink-0">
                        <Check className="w-5 h-5 stroke-[3]" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Advance Booking Schedule Drawer */}
                <AnimatePresence>
                  {activeTab === "advance" && (
                    <motion.div
                      initial={{ opacity: 0, height: 0, y: -6 }}
                      animate={{ opacity: 1, height: "auto", y: 0 }}
                      exit={{ opacity: 0, height: 0, y: -6 }}
                      transition={{ duration: 0.18 }}
                      className="bg-amber-50/60 rounded-2xl p-3 sm:p-4 shadow-xs text-left space-y-3 border border-amber-200/80 w-full max-w-full box-border overflow-hidden"
                    >
                      <div className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                        Ride Schedule Parameters
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 w-full min-w-0">
                        <div className="w-full min-w-0">
                          <label htmlFor="schedule-date" className="block text-xs font-bold text-slate-800 mb-1.5">
                            Pickup Date
                          </label>
                          <input
                            id="schedule-date"
                            type="date"
                            value={advanceDate}
                            min={new Date().toISOString().split("T")[0]}
                            onChange={(e) => setAdvanceDate(e.target.value)}
                            className="w-full max-w-full min-w-0 box-border block bg-white border border-slate-300 rounded-xl px-2.5 sm:px-3.5 py-2.5 h-11 text-sm font-bold text-slate-900 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-400/20 shadow-xs cursor-pointer"
                          />
                        </div>
                        <div className="w-full min-w-0">
                          <label htmlFor="schedule-hour" className="block text-xs font-bold text-slate-800 mb-1.5">
                            Pickup Hour (IST)
                          </label>
                          <select
                            id="schedule-hour"
                            value={advanceHour}
                            onChange={(e) => setAdvanceHour(parseInt(e.target.value, 10))}
                            className="w-full max-w-full min-w-0 box-border block bg-white border border-slate-300 rounded-xl px-2.5 sm:px-3.5 py-2.5 h-11 text-sm font-bold text-slate-900 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-400/20 shadow-xs cursor-pointer appearance-auto"
                          >
                            {Array.from({ length: 24 }, (_, i) => (
                              <option key={i} value={i} className="text-slate-900 font-bold py-1">
                                {formatHourDisplay(i)}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* 2. 4 OTP Digit Boxes Container */}
                <div className="pt-2 text-center">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                    Verification Code
                  </div>
                  <div 
                    className="flex justify-center items-center gap-3 sm:gap-4 my-2 cursor-pointer"
                    onClick={handleCopyOnlyOtp}
                    title="Click to copy OTP"
                  >
                    {[0, 1, 2, 3].map((idx) => {
                      const digit = hasMinFourDigits ? generatedOtp[idx] : null;
                      return (
                        <motion.div
                          key={idx}
                          initial={false}
                          animate={digit ? { scale: [0.92, 1] } : {}}
                          transition={{ duration: 0.15 }}
                          className="w-14 h-16 sm:w-16 sm:h-18 rounded-2xl bg-[#EEF2F6] flex items-center justify-center border border-slate-200 shadow-xs hover:border-amber-400 transition-all select-none"
                        >
                          {digit ? (
                            <span className="text-3xl sm:text-4xl font-black text-slate-900 font-mono">
                              {digit}
                            </span>
                          ) : (
                            idx < cleanDigits.length ? (
                              <span className="w-3 h-3 rounded-full bg-slate-800 inline-block" />
                            ) : (
                              <span className="w-2.5 h-2.5 rounded-full bg-slate-300 inline-block" />
                            )
                          )}
                        </motion.div>
                      );
                    })}
                  </div>

                  {/* Copy OTP Code Action */}
                  {hasMinFourDigits && (
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={handleCopyOnlyOtp}
                        className="text-xs font-bold text-amber-700 hover:text-amber-800 cursor-pointer inline-flex items-center space-x-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200/80 px-3.5 py-1.5 rounded-xl transition-colors shadow-2xs"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Code</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* 3. Action Buttons with comfortable spacing */}
                <div className="grid grid-cols-2 gap-3 pt-3">
                  <button
                    type="button"
                    onClick={handleSendWhatsApp}
                    disabled={!hasMinFourDigits}
                    className={`py-3.5 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center space-x-2 transition-all cursor-pointer ${
                      hasMinFourDigits
                        ? "bg-[#25D366] hover:bg-[#20ba59] text-white shadow-xs active:scale-98"
                        : "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200/60"
                    }`}
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>WhatsApp</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSendOtp}
                    disabled={!hasMinFourDigits}
                    className={`py-3.5 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center space-x-2 transition-all cursor-pointer ${
                      hasMinFourDigits
                        ? "bg-slate-900 hover:bg-slate-800 text-white shadow-xs active:scale-98"
                        : "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200/60"
                    }`}
                  >
                    <Send className="w-4 h-4" />
                    <span>SMS</span>
                  </button>
                </div>

                {/* Notification Statuses */}
                {smsTriggered && (
                  <div className="text-xs text-center text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-2 font-medium">
                    SMS app launched. Tap send to dispatch.
                  </div>
                )}

                {whatsappTriggered && (
                  <div className="text-xs text-center text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl p-2 font-medium">
                    WhatsApp opened. Send prefilled message to customer.
                  </div>
                )}

                {/* Prefilled message preview */}
                {hasMinFourDigits && (
                  <div className="bg-slate-50/80 border border-slate-200/60 rounded-xl p-3 text-[11px] font-mono text-slate-700 space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] uppercase font-bold text-slate-400">
                      <span>Message Preview</span>
                      <button
                        type="button"
                        onClick={handleCopyOtpMessage}
                        className="text-amber-700 hover:text-amber-800 cursor-pointer flex items-center space-x-1"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Copy</span>
                      </button>
                    </div>
                    <p className="whitespace-pre-wrap leading-relaxed select-all">
                      {getOtpMessage()}
                    </p>
                  </div>
                )}

              </div>
            </div>

          </div>
        )}

      </main>

      {/* Global PWA Connectivity Indicator */}
      <OfflineIndicator />

    </div>
  );
}
