export const TERMS_AND_CONDITIONS = [
  {
    title: "1. Acceptance of Terms",
    content: "By tapping \"I Agree\", registering, logging in, accessing, or continuing to use the App, you acknowledge that you have read, understood, and accepted these Terms & Conditions."
  },
  {
    title: "2. Tool Purpose & Scope",
    content: "The App is provided solely as a taxi meter, fare calculation, trip management, billing, driver management, and vendor management tool."
  },
  {
    title: "3. Vendor Responsibilities",
    content: "Vendors are solely responsible for managing Drivers, OTPs, PINs, Verification Codes, fare configurations, tariff settings, vehicle categories, customer management, customer-related issues, trip-related settings, account access, and all customer and business operations associated with their services."
  },
  {
    title: "4. Driver Responsibilities",
    content: "Drivers are solely responsible for operating their vehicles legally, managing trips, verifying trip details, collecting fares, providing transportation services, maintaining required permits and licenses, and complying with all applicable laws and regulations."
  },
  {
    title: "5. Fares & Tariffs Management",
    content: "All fare calculations, tariffs, trip charges, vehicle category settings, and other fare-related configurations displayed by the App are managed by the Vendor. Vendors and Drivers are solely responsible for verifying and applying the appropriate fares for their operations."
  },
  {
    title: "6. Limitation of Liability & Disclaimers",
    content: "The App developer and Covai Meter Taxi are not responsible for fare disputes, customer disputes, trip issues, route selection, GPS inaccuracies, payment collection, transportation services, customer claims, customer complaints, legal compliance, accidents, damages, penalties, service interruptions, data loss, or any direct or indirect business losses arising from the use of the App."
  },
  {
    title: "7. Customer Interactions & Dispute Handling",
    content: "Vendors and Drivers are solely responsible for customer interactions, customer satisfaction, fare collection, OTP verification, transportation services, complaint resolution, dispute handling, legal compliance, and all obligations arising from their taxi operations."
  },
  {
    title: "8. \"As Is\" Basis & Service Discontinuation",
    content: "The App is provided on an \"AS IS\" and \"AS AVAILABLE\" basis without warranties of any kind. The App developer reserves the right to modify, suspend, restrict, discontinue, or terminate any feature, account, or service at any time without prior notice."
  },
  {
    title: "9. Prohibited Activity & Termination",
    content: "Any misuse, fraud, unauthorized access, credential sharing, reverse engineering, tampering, or unlawful activity may result in account suspension or permanent termination."
  },
  {
    title: "10. Governing Law & Jurisdiction",
    content: "All disputes relating to the App shall be subject to the exclusive jurisdiction of the courts located in Coimbatore, Tamil Nadu, India."
  },
  {
    title: "11. Non-Refundable & Non-Transferable Payments",
    content: "All payments, subscription fees, registration fees, activation fees, renewal fees, maintenance charges, and any other amounts paid for the App or related services are strictly non-refundable and non-transferable under any circumstances."
  },
  {
    title: "12. Final Agreement & Sole Responsibility",
    content: "By tapping \"I Agree\", you acknowledge and agree that all driver management, OTP verification, fare management, trip operations, customer interactions, customer-related issues, fare collection, transportation services, liabilities, and obligations remain solely the responsibility of the Vendor and Driver, and not of the App developer or Covai Meter Taxi."
  }
];

interface TermsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAgree?: () => void;
  showAgreeButton?: boolean;
}

export function TermsModal({ isOpen, onClose, onAgree, showAgreeButton = true }: TermsModalProps) {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 md:p-6 bg-white/80 backdrop-blur-md transition-all animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="terms-heading"
    >
      <div className="w-full max-w-xl md:max-w-2xl bg-white rounded-2xl sm:rounded-3xl shadow-[0_16px_50px_rgba(15,23,42,0.12)] border border-slate-200 overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[88dvh]">
        
        {/* Full White Theme Header */}
        <div className="bg-white px-5 sm:px-7 py-4 sm:py-5 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div>
            <h2 id="terms-heading" className="text-base sm:text-lg font-black text-slate-900 tracking-tight uppercase">
              TERMS & CONDITIONS
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Covai Meter Taxi
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 active:bg-slate-200 text-xs font-bold text-slate-700 transition-colors cursor-pointer"
            aria-label="Close Terms"
          >
            Close
          </button>
        </div>

        {/* Scrollable Legal Document Body - Pure White Theme & Neat Typography */}
        <div className="bg-white p-5 sm:p-7 md:p-8 overflow-y-auto space-y-6 text-slate-800 overscroll-contain">
          
          {/* Important Notice Box */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 sm:p-4 text-xs sm:text-sm text-slate-800 leading-relaxed font-normal">
            <span className="font-bold text-slate-950 block mb-1">Notice:</span>
            Please review these Terms & Conditions carefully. By tapping "I Agree", registering, logging in, accessing, or continuing to use the App, you acknowledge that you have read, understood, and accepted these terms in full.
          </div>

          {/* Clauses List */}
          <div className="space-y-5">
            {TERMS_AND_CONDITIONS.map((item, index) => (
              <div key={index} className="space-y-1.5 pb-4 border-b border-slate-100 last:border-b-0 last:pb-0">
                <h3 className="font-bold text-slate-950 text-xs sm:text-sm tracking-wide">
                  {item.title}
                </h3>
                <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-normal">
                  {item.content}
                </p>
              </div>
            ))}
          </div>

          {/* Legal Jurisdiction Note */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 sm:p-3.5 text-xs text-slate-600 leading-relaxed">
            <span className="font-bold text-slate-900">Jurisdiction: </span>
            Coimbatore, Tamil Nadu, India. All operations, tariffs, and transportation obligations remain solely with the Vendor and Driver.
          </div>
        </div>

        {/* Full White Theme Footer Actions */}
        <div className="bg-white p-4 sm:p-5 border-t border-slate-200 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-50 active:bg-slate-100 text-xs sm:text-sm font-bold text-slate-700 transition-colors cursor-pointer text-center"
          >
            Close
          </button>
          {showAgreeButton && onAgree && (
            <button
              type="button"
              onClick={onAgree}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 active:scale-98 text-white text-xs sm:text-sm font-black transition-all shadow-sm cursor-pointer text-center"
            >
              I Agree
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
