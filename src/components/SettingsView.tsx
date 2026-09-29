import { useState, useEffect, type ChangeEvent } from "react";
import { 
  Building2, 
  Upload, 
  Trash2, 
  Check, 
  Save, 
  RotateCcw, 
  AlertCircle,
  LogOut
} from "lucide-react";
import type { CompanyProfile } from "../types/billing";
import { DEFAULT_COMPANY_PROFILE } from "../types/billing";
import { saveStoredCompanyProfile } from "../utils/storage";
import type { VendorSession } from "../services/vendorAuth";
import { TermsModal } from "./TermsModal";

interface SettingsViewProps {
  profile: CompanyProfile;
  onProfileUpdated: (newProfile: CompanyProfile) => void;
  vendorSession?: VendorSession | null;
  onLogout?: () => void;
}

export function SettingsView({ profile, onProfileUpdated, vendorSession, onLogout }: SettingsViewProps) {
  const [formData, setFormData] = useState<CompanyProfile>(profile);
  const [isSaved, setIsSaved] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [showTermsModal, setShowTermsModal] = useState(false);

  // Keep formData in sync when profile prop updates
  useEffect(() => {
    setFormData(profile);
  }, [profile]);

  // Handle text field edits
  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setIsSaved(false);
  };

  // Handle Logo Upload (base64 for localStorage persistence)
  const handleLogoUpload = (e: ChangeEvent<HTMLInputElement>) => {
    setLogoError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size limit: keep under 1.5MB for safe localStorage quota
    if (file.size > 1.5 * 1024 * 1024) {
      setLogoError("Logo image should be under 1.5 MB for fast offline storage.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setFormData(prev => ({ ...prev, logoUrl: reader.result as string }));
        setIsSaved(false);
      }
    };
    reader.onerror = () => {
      setLogoError("Could not read image file. Please try another image.");
    };
    reader.readAsDataURL(file);
  };

  // Remove Logo
  const handleRemoveLogo = () => {
    setFormData(prev => ({ ...prev, logoUrl: "" }));
    setIsSaved(false);
  };

  // Save to localStorage
  const handleSave = () => {
    saveStoredCompanyProfile(formData);
    onProfileUpdated(formData);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2500);
  };

  // Reset to default
  const handleReset = () => {
    localStorage.removeItem("covai_meter_taxi_company_profile");
    localStorage.removeItem("companyDetails");
    localStorage.removeItem("companyLogo");
    setFormData(DEFAULT_COMPANY_PROFILE);
    saveStoredCompanyProfile(DEFAULT_COMPANY_PROFILE);
    onProfileUpdated(DEFAULT_COMPANY_PROFILE);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  return (
    <div className="flex-1 flex flex-col bg-[#FDCB58] w-full">
      
      {/* Top Yellow Half - Clean breathing room */}
      <div className="py-7 sm:py-9 px-5 sm:px-6 text-center text-slate-950 relative max-w-md mx-auto w-full">
        
        {/* Top Quick Actions Pill */}
        <div className="inline-flex items-center p-1.5 bg-black/10 rounded-2xl space-x-2 backdrop-blur-xs shadow-inner/10">
          <button
            type="button"
            onClick={handleReset}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-900/80 hover:text-slate-950 hover:bg-black/5 transition-all cursor-pointer flex items-center space-x-1.5"
            title="Reset to default company details"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Defaults</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            className={`px-5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center space-x-1.5 shadow-xs ${
              isSaved 
                ? "bg-emerald-600 text-white" 
                : "bg-white text-slate-950"
            }`}
          >
            {isSaved ? (
              <>
                <Check className="w-3.5 h-3.5 stroke-[3]" />
                <span>Saved!</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>Save Settings</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Bottom White Section - Sweeps across full width */}
      <div className="flex-1 bg-white rounded-tl-[48px] sm:rounded-tl-[64px] pt-8 sm:pt-10 pb-24 px-5 sm:px-8 shadow-[0_-12px_30px_rgba(0,0,0,0.03)] w-full">
        <div className="max-w-2xl mx-auto space-y-7 sm:space-y-8">
          
          {/* Main Settings Card */}
          <div className="bg-slate-50/70 border border-slate-200/90 rounded-2xl p-6 sm:p-8 space-y-6">
            
            {/* Company Logo Section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Company Logo
                </label>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                {/* Logo Preview Box */}
                <div className="w-24 h-24 rounded-2xl border-2 border-dashed border-slate-200 flex items-center justify-center bg-white overflow-hidden relative shrink-0 shadow-xs">
                  {formData.logoUrl ? (
                    <img 
                      src={formData.logoUrl} 
                      alt="Company Logo" 
                      className="w-full h-full object-contain p-1"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="text-center p-2">
                      <Building2 className="w-8 h-8 mx-auto text-slate-300" />
                      <span className="text-[10px] text-slate-400 mt-1 block">No Logo</span>
                    </div>
                  )}
                </div>

                {/* Logo Controls */}
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-slate-950 hover:bg-slate-800 text-white text-xs font-bold rounded-xl cursor-pointer transition-all shadow-xs active:scale-98">
                      <Upload className="w-3.5 h-3.5 text-amber-400" />
                      <span>Upload Logo</span>
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={handleLogoUpload} 
                        className="hidden" 
                      />
                    </label>

                    {formData.logoUrl && (
                      <button
                        type="button"
                        onClick={handleRemoveLogo}
                        className="inline-flex items-center space-x-1 px-3 py-2 text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-xl transition-colors cursor-pointer border border-rose-200/60"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remove</span>
                      </button>
                    )}
                  </div>
                  {logoError && (
                    <p className="text-xs text-rose-600 flex items-center space-x-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>{logoError}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="h-px bg-slate-200/70" />

            {/* Company Name & Phone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  Company Name
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder=""
                  className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-900 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 shadow-2xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Company Phone 
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder=""
                  className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-mono font-medium text-slate-900 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 shadow-2xs"
                />
              </div>
            </div>

            {/* Company Email & GSTIN */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Company Email ID
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder=""
                  className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-900 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 shadow-2xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  GST Number (If available)
                </label>
                <input
                  type="text"
                  name="gstin"
                  value={formData.gstin}
                  onChange={handleChange}
                  placeholder="GSTIN E.G.33AAAAA0000A1Z5"
                  className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-mono uppercase text-slate-900 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 shadow-2xs"
                />
              </div>
            </div>

            {/* Website */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">
                Company Website / URL
              </label>
              <input
                type="text"
                name="website"
                value={formData.website || ""}
                onChange={handleChange}
                placeholder=""
                className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-900 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 shadow-2xs"
              />
            </div>

            {/* Address */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">
                Full Company Address
              </label>
              <textarea
                name="address"
                rows={2}
                value={formData.address}
                onChange={handleChange}
                placeholder=""
                className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm text-slate-900 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 resize-none shadow-2xs"
              />
            </div>

          </div>

          {/* Primary Save Button */}
          <div>
            <button
              type="button"
              onClick={handleSave}
              className={`w-full py-4 px-6 rounded-2xl font-black text-sm sm:text-base tracking-wide transition-all shadow-xs flex items-center justify-center space-x-2 cursor-pointer ${
                isSaved 
                  ? "bg-emerald-600 text-white"
                  : "bg-[#FDCB58] hover:bg-[#F2BD44] active:scale-[0.98] text-slate-950"
              }`}
            >
              {isSaved ? (
                <>
                  <Check className="w-5 h-5 stroke-[3]" />
                  <span>Settings Saved Successfully</span>
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  <span>Save All Settings</span>
                </>
              )}
            </button>
          </div>

          {/* Vendor Account & Sign Out Section */}
          {vendorSession && (
            <div className="pt-4 border-t border-slate-200/80">
              <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Vendor Session
                  </span>
                </div>

                <div className="flex items-center justify-between bg-white border border-slate-200/70 rounded-xl px-3.5 py-2.5">
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Vendor ID
                    </span>
                    <span className="font-mono text-sm font-black text-slate-950">
                      {vendorSession.vendorId}
                    </span>
                  </div>
                  {vendorSession.vendorName && (
                    <div className="text-right">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Account
                      </span>
                      <span className="text-xs font-semibold text-slate-700">
                        {vendorSession.vendorName}
                      </span>
                    </div>
                  )}
                </div>

                <div className="pt-1 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setShowTermsModal(true)}
                    className="text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors inline-block cursor-pointer underline underline-offset-2 py-1"
                  >
                    View Terms & Conditions
                  </button>
                </div>

                {onLogout && (
                  <button
                    type="button"
                    onClick={onLogout}
                    className="w-full py-2.5 px-4 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100/80 active:scale-[0.98] text-rose-700 text-xs font-bold transition-all flex items-center justify-center space-x-2 cursor-pointer shadow-2xs"
                  >
                    <LogOut className="w-3.5 h-3.5 text-rose-600" />
                    <span>Sign Out of this Device</span>
                  </button>
                )}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Terms & Conditions Modal */}
      <TermsModal
        isOpen={showTermsModal}
        onClose={() => setShowTermsModal(false)}
        showAgreeButton={false}
      />

    </div>
  );
}
