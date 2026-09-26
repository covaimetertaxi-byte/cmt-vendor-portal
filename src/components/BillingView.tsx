import { useState, useRef, useEffect, type ChangeEvent } from 'react';
import { 
  Printer, 
  Download, 
  Share2, 
  Plus, 
  FileText, 
  Eye, 
  Upload, 
  X, 
  Sparkles, 
  ClipboardPaste, 
  Check, 
  CheckCircle2,
  Settings, 
  MapPin, 
  Navigation, 
  Car, 
  User, 
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Calendar,
  Clock,
  RotateCcw,
  Edit3,
  Building2,
  Phone,
  Mail,
  ShieldCheck,
  Trash2
} from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { toPng } from 'html-to-image';
import { InvoiceData, INITIAL_DATA, VEHICLE_TYPES } from '../types';
import { parseCopiedRideText, type ParsedBillResult } from '../utils/textParser';
import type { CompanyProfile } from '../types/billing';

interface BillingViewProps {
  companyProfile?: CompanyProfile;
  onNavigateToSettings?: () => void;
}

export function BillingView({ companyProfile, onNavigateToSettings }: BillingViewProps) {
  const [data, setData] = useState<InvoiceData>(() => ({
    company: {
      name: companyProfile?.name || '',
      logo: companyProfile?.logoUrl || null,
      address: companyProfile?.address || '',
      phone: companyProfile?.phone || '',
      email: companyProfile?.email || '',
      website: companyProfile?.website || '',
      customInfo: companyProfile?.gstin ? `GSTIN: ${companyProfile.gstin}` : '',
    },
    invoice: {
      number: `${Math.floor(10000000 + Math.random() * 90000000)}`,
      date: new Date().toISOString().split('T')[0],
    },
    passenger: {
      name: '',
      phone: ''
    },
    trip: {
      pickup: '',
      drop: '',
      startTime: '',
      endTime: '',
      duration: '',
      routeMap: ''
    },
    vehicle: {
      type: '',
      number: ''
    },
    fare: {
      ...INITIAL_DATA.fare,
      baseFare: 0,
      distance: 0,
      distanceFare: undefined,
      waitingFare: undefined,
      minFareAdjustment: undefined,
      toll: 0,
      permit: 0,
      driverBata: 0,
      advancePaid: 0,
    },
    driver: {
      name: ''
    },
    notes: ''
  }));

  // Default is 'paste' (Paste Booking) and 'manual' is secondary
  const [billingTab, setBillingTab] = useState<'paste' | 'manual'>('paste');
  const [showPreview, setShowPreview] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(companyProfile?.logoUrl || null);
  const [previewScale, setPreviewScale] = useState(1);
  const [invoiceHeight, setInvoiceHeight] = useState(0);
  const invoiceRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const [showExtraFareOptions, setShowExtraFareOptions] = useState(false);
  const [pricingType, setPricingType] = useState<'km' | 'hourly'>('km');

  // Sync company details whenever companyProfile updates from Settings
  useEffect(() => {
    const newLogo = companyProfile?.logoUrl || null;
    setData(prev => ({
      ...prev,
      company: {
        name: companyProfile?.name || '',
        logo: newLogo,
        address: companyProfile?.address || '',
        phone: companyProfile?.phone || '',
        email: companyProfile?.email || '',
        website: companyProfile?.website || '',
        customInfo: companyProfile?.gstin ? `GSTIN: ${companyProfile.gstin}` : '',
      }
    }));
    setLogoPreview(newLogo);
  }, [companyProfile]);

  useEffect(() => {
    const updateScale = () => {
      if (window.innerWidth < 768) {
        const scale = (window.innerWidth - 32) / 794;
        setPreviewScale(Math.max(0.38, scale));
        if (invoiceRef.current) {
          setInvoiceHeight(invoiceRef.current.offsetHeight);
        }
      } else {
        setPreviewScale(1);
        setInvoiceHeight(0);
      }
    };

    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);

  useEffect(() => {
    if (showPreview && invoiceRef.current) {
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setInvoiceHeight(entry.contentRect.height);
        }
      });
      observer.observe(invoiceRef.current);
      return () => observer.disconnect();
    }
  }, [showPreview, data]);

  const formatReceiptDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  const calculateTotal = () => {
    const { fare } = data;
    const isHourly = pricingType === 'hourly';
    
    // Distance fare: only for standard KM trips, NEVER for package trips (which are covered by baseFare)
    const tripAmount = !isHourly
      ? ((fare.distanceFare !== undefined && fare.distanceFare > 0)
          ? fare.distanceFare
          : ((fare.distance || 0) * (fare.ratePerKm || 0)))
      : 0;

    // Hourly rental fare: hours * ratePerHour
    const hourlyAmount = ((fare.hours || 0) * (fare.ratePerHour || 0));

    // Extra kms amount: explicit extraKmsFare or extraKms * extraKmsRate
    const extraKmsAmount = (fare.extraKmsFare !== undefined && fare.extraKmsFare > 0)
      ? fare.extraKmsFare
      : ((fare.extraKms || 0) * (fare.extraKmsRate || 0));

    // Extra time amount: explicit extraTimeFare or extraTime * extraTimeRate
    const extraTimeAmount = (fare.extraTimeFare !== undefined && fare.extraTimeFare > 0)
      ? fare.extraTimeFare
      : ((fare.extraTime || 0) * (fare.extraTimeRate || 0));

    // Waiting charge: either explicit waitingFare or waitingMinutes * waitingRate
    const waitingCharge = (fare.waitingFare !== undefined && fare.waitingFare > 0)
      ? fare.waitingFare
      : ((fare.waitingMinutes || 0) * (fare.waitingRate || 0));
    
    const subTotal = 
      (fare.baseFare || 0) +
      tripAmount + 
      hourlyAmount +
      extraKmsAmount +
      extraTimeAmount +
      waitingCharge + 
      (!isHourly ? (fare.minFareAdjustment || 0) : 0) +
      (fare.toll || 0) + 
      (fare.permit || 0) + 
      (fare.driverBata || 0) + 
      (fare.peakCharge || 0) + 
      (fare.extraCharges || 0) +
      (fare.surcharge || 0) +
      (fare.dayRent || 0) +
      (fare.hillsCharge || 0);

    const taxAmount = (subTotal * (fare.taxPercentage || 0)) / 100;
    const grandTotal = subTotal + taxAmount;
    const balance = grandTotal - (fare.advancePaid || 0);
    
    return {
      subTotal,
      taxAmount,
      grandTotal,
      advance: fare.advancePaid || 0,
      balance: Math.max(0, balance)
    };
  };

  const updateField = (section: keyof InvoiceData, field: string, value: any) => {
    setData(prev => ({
      ...prev,
      [section]: typeof prev[section] === 'object' 
        ? { ...(prev[section] as object), [field]: value }
        : value
    }));
  };

  const updateFare = (field: keyof InvoiceData['fare'], value: string) => {
    const finalValue = field === 'taxLabel' ? value : (value === '' ? 0 : (parseFloat(value) || 0));
    setData(prev => {
      const updatedFare = { ...prev.fare, [field]: finalValue };
      // When manual rate/distance is entered, remove explicit fixed overrides so calculations react
      if (field === 'distance' || field === 'ratePerKm') {
        delete updatedFare.distanceFare;
      }
      if (field === 'waitingMinutes' || field === 'waitingRate') {
        delete updatedFare.waitingFare;
      }
      if (field === 'extraKms' || field === 'extraKmsRate') {
        delete updatedFare.extraKmsFare;
      }
      if (field === 'extraTime' || field === 'extraTimeRate') {
        if (field === 'extraTime' && (updatedFare.extraTimeRate || 0) > 0) {
          updatedFare.extraTimeFare = (updatedFare.extraTime || 0) * (updatedFare.extraTimeRate || 0);
        } else if (field === 'extraTimeRate' && (updatedFare.extraTime || 0) > 0) {
          updatedFare.extraTimeFare = (updatedFare.extraTime || 0) * (updatedFare.extraTimeRate || 0);
        }
      }
      return {
        ...prev,
        fare: updatedFare
      };
    });
  };

  // User typed raw string inputs for numbers (free to type decimals, empty, etc. without scroll jumping/spin)
  const [rawFareInputs, setRawFareInputs] = useState<Record<string, string>>({});

  const getFareDisplayValue = (field: keyof InvoiceData['fare']) => {
    if (rawFareInputs[field] !== undefined) {
      return rawFareInputs[field];
    }
    const val = data.fare[field];
    if (val === undefined || val === 0 || val === null) {
      return '';
    }
    return String(val);
  };

  const handleFareInputChange = (field: keyof InvoiceData['fare'], rawVal: string) => {
    // Allow digits and at most one decimal point
    let cleaned = rawVal.replace(/[^0-9.]/g, '');
    const dotIndex = cleaned.indexOf('.');
    if (dotIndex !== -1) {
      cleaned = cleaned.slice(0, dotIndex + 1) + cleaned.slice(dotIndex + 1).replace(/\./g, '');
    }

    setRawFareInputs(prev => ({
      ...prev,
      [field]: cleaned
    }));

    updateFare(field, cleaned);
  };

  const clearFareField = (field: keyof InvoiceData['fare']) => {
    setRawFareInputs(prev => ({
      ...prev,
      [field]: ''
    }));
    updateFare(field, '');
  };

  // Applies parsed trip data into the active bill
  const applyParsedTrip = (res: ParsedBillResult) => {
    setRawFareInputs({});
    const { parsed, detectedFields, isPackage } = res;

    if (isPackage) {
      setPricingType('hourly');
    } else {
      setPricingType('km');
    }

    setData(prev => {
      const isPkg = isPackage || false;
      return {
        ...prev,
        invoice: {
          ...prev.invoice,
          number: parsed.billNumber ? parsed.billNumber : prev.invoice.number,
          date: parsed.billDate ? parsed.billDate : prev.invoice.date,
        },
        passenger: {
          name: parsed.customerName ? parsed.customerName.toUpperCase() : 'CUSTOMER',
          phone: parsed.customerPhone || ''
        },
        trip: {
          pickup: parsed.pickupLocation ? parsed.pickupLocation.toUpperCase() : '',
          drop: parsed.dropLocation ? parsed.dropLocation.toUpperCase() : '',
          startTime: parsed.startTime || '',
          endTime: parsed.endTime || '',
          duration: parsed.duration || '',
          routeMap: parsed.routeMap || ''
        },
        vehicle: {
          type: parsed.vehicleType ? parsed.vehicleType.toUpperCase() : '',
          number: parsed.vehicleNumber ? parsed.vehicleNumber.toUpperCase() : ''
        },
        driver: {
          name: parsed.driverName ? parsed.driverName.toUpperCase() : ''
        },
        fare: {
          ...INITIAL_DATA.fare,
          baseFare: parsed.baseFare !== undefined ? parsed.baseFare : 0,
          distance: parsed.totalKm !== undefined ? parsed.totalKm : 0,
          packageKm: parsed.packageKm !== undefined ? parsed.packageKm : (isPkg ? 10 : undefined),
          hours: parsed.packageHours !== undefined ? parsed.packageHours : (isPkg ? 1 : 0),
          ratePerHour: 0,
          distanceFare: !isPkg ? parsed.distanceFare : undefined,
          ratePerKm: !isPkg ? (parsed.ratePerKm !== undefined ? parsed.ratePerKm : 0) : 0,
          extraKms: parsed.extraKms !== undefined ? parsed.extraKms : 0,
          extraKmsRate: parsed.extraKmsRate !== undefined ? parsed.extraKmsRate : 0,
          extraKmsFare: parsed.extraKmsFare !== undefined ? parsed.extraKmsFare : 0,
          extraTime: parsed.extraTime !== undefined ? parsed.extraTime : 0,
          extraTimeRate: parsed.extraTimeRate !== undefined ? parsed.extraTimeRate : 0,
          extraTimeFare: parsed.extraTimeFare !== undefined ? parsed.extraTimeFare : 0,
          extraTimeUnit: (parsed as any).extraTimeUnit || 'mins',
          waitingFare: parsed.waitingFare !== undefined ? parsed.waitingFare : undefined,
          minFareAdjustment: !isPkg ? parsed.minFareAdjustment : undefined,
          waitingMinutes: parsed.waitingMinutes !== undefined ? parsed.waitingMinutes : 0,
          waitingRate: parsed.waitingRate !== undefined ? parsed.waitingRate : 0,
          toll: parsed.tollCharges || 0,
          permit: (parsed as any).permit || 0,
          extraCharges: parsed.otherCharges || 0,
          driverBata: parsed.driverBata || 0,
          surcharge: parsed.nightCharges || 0,
          dayRent: 0,
          hillsCharge: 0,
          peakCharge: 0,
          taxPercentage: 0,
          taxLabel: '',
          advancePaid: 0,
        }
      };
    });
  };

  // Process pasted WhatsApp / SMS / dispatch / receipt text
  const handleProcessPastedText = (text: string) => {
    setPastedText(text);
    if (!text.trim()) return;
    setRawFareInputs({});
    const res = parseCopiedRideText(text);
    applyParsedTrip(res);
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        handleProcessPastedText(text);
      }
    } catch {
      // ignore
    }
  };

  // Generates 100% reliable, high-resolution, non-blank Single-Page PDF Blob
  const generatePdfBlob = async (): Promise<Blob> => {
    const page1El = document.getElementById('receipt-page-export') || document.getElementById('receipt-page-1');
    if (!page1El) throw new Error("Invoice element not found in DOM");

    const pdf = new jsPDF({
      orientation: 'p',
      unit: 'mm',
      format: 'a4',
      compress: true
    });

    let imgData: string | null = null;

    try {
      // html2canvas with explicit bounds from root element
      const canvas = await html2canvas(page1El, { 
        scale: 2.2, 
        useCORS: true,
        logging: false,
        allowTaint: true,
        backgroundColor: '#ffffff',
        windowWidth: 1000,
        scrollX: 0,
        scrollY: 0,
        x: 0,
        y: 0,
        width: page1El.offsetWidth || 794,
        height: page1El.offsetHeight || 1123
      });
      const testData = canvas.toDataURL('image/png', 1.0);
      // Validate that canvas is not empty or blank
      if (testData && testData.length > 5000) {
        imgData = testData;
      }
    } catch (err) {
      console.warn("html2canvas error, falling back to toPng", err);
    }

    // High quality fallback: html-to-image toPng
    if (!imgData) {
      imgData = await toPng(page1El, {
        quality: 1.0,
        backgroundColor: '#ffffff',
        pixelRatio: 2.2,
        cacheBust: true,
      });
    }

    if (!imgData) {
      throw new Error("Failed to render invoice image data");
    }

    // Strictly fill the 210mm x 297mm A4 page
    pdf.addImage(imgData, 'PNG', 0, 0, 210, 297, undefined, 'FAST');
    return pdf.output('blob');
  };

  // Direct Single-Page PDF Download
  const downloadPDF = async () => {
    if (isGenerating) return;
    setIsGenerating(true);

    try {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const blob = await generatePdfBlob();
      const fileName = `Trip-Invoice-${data.invoice.number}.pdf`;

      if (isMobile) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }, 200);
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }, 200);
      }
    } catch (error) {
      console.error('Error generating PDF:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  // WhatsApp PDF Share: Directly shares the PDF document file to WhatsApp without downloading and without text
  const shareWhatsApp = async () => {
    if (isGenerating) return;
    setIsGenerating(true);

    try {
      const blob = await generatePdfBlob();
      const fileName = `Trip-Invoice-${data.invoice.number}.pdf`;
      const pdfFile = new File([blob], fileName, { type: 'application/pdf' });

      // Share PDF file directly via native share sheet (Android & iOS)
      if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
        try {
          await navigator.share({
            files: [pdfFile],
            title: fileName,
          });
          return;
        } catch (shareErr: any) {
          if (shareErr.name === 'AbortError') return; // User closed share modal
        }
      }

      // Fallback only if device browser doesn't support Web Share with files (e.g. desktop)
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 300);
    } catch (err) {
      console.error("WhatsApp PDF share failed:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  const printInvoice = () => {
    window.print();
  };

  const resetData = () => {
    setRawFareInputs({});
    setData(prev => ({
      ...prev,
      passenger: { name: '', phone: '' },
      trip: { pickup: '', drop: '', startTime: '', endTime: '', duration: '', routeMap: '' },
      vehicle: { type: '', number: '' },
      driver: { name: '' },
      fare: {
        ...INITIAL_DATA.fare,
        baseFare: 0,
        distance: 0,
        distanceFare: undefined,
        waitingFare: undefined,
        minFareAdjustment: undefined,
        ratePerKm: 0,
        hours: 0,
        ratePerHour: 0,
        extraKms: 0,
        extraKmsRate: 0,
        extraTime: 0,
        extraTimeRate: 0,
        waitingMinutes: 0,
        waitingRate: 0,
        toll: 0,
        permit: 0,
        driverBata: 0,
        advancePaid: 0,
      },
      invoice: {
        number: `${Math.floor(10000000 + Math.random() * 90000000)}`,
        date: new Date().toISOString().split('T')[0],
      },
      notes: ''
    }));
    setPastedText('');
    setShowPreview(false);
  };

  const totals = calculateTotal();

  // SPACIOUS, FULL-PAGE SINGLE A4 INVOICE TEMPLATE (210mm x 297mm)
  const renderInvoiceTemplate = (containerId = 'receipt-page-1') => (
    <div ref={containerId === 'receipt-page-export' ? undefined : invoiceRef} className="space-y-6 print:space-y-0">
      <div 
        id={containerId}
        className="bg-white mx-auto p-[14mm] w-[210mm] min-h-[297mm] max-h-[297mm] h-[297mm] border border-[#F2F2F2] print:border-none print:shadow-none text-[#111827] print-invoice font-sans flex flex-col justify-between box-border page-break relative overflow-hidden"
        style={{ width: '210mm', height: '297mm', minHeight: '297mm', maxHeight: '297mm', boxSizing: 'border-box' }}
      >
        <div className="flex-1 flex flex-col justify-between">
          
          {/* 1. Header Section: Big Crisp Logo on Left, Order-wise Company Details on Right */}
          <div className="flex justify-between items-start pb-4 border-b border-slate-200/90 gap-6">
            
            {/* Left: Big Prominent Logo + Single Invoice # */}
            <div className="flex flex-col items-start max-w-[360px]">
              {/* Big Crisp Logo */}
              {logoPreview && (
                <div className="mb-3 flex items-center">
                  <img 
                    src={logoPreview} 
                    alt={data.company.name || "Company Logo"} 
                    className="h-32 sm:h-36 max-h-40 w-auto max-w-[340px] object-contain object-left block drop-shadow-xs" 
                    referrerPolicy="no-referrer" 
                  />
                </div>
              )}

              {/* Single Invoice Number */}
              <div className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                <span className="font-bold text-slate-500 uppercase tracking-wider text-[11px]">Invoice No:</span>
                <input 
                  type="text" 
                  value={data.invoice.number}
                  onChange={(e) => updateField('invoice', 'number', e.target.value)}
                  className="font-mono font-bold text-xs text-slate-900 bg-transparent hover:bg-slate-100 focus:bg-white border border-transparent hover:border-slate-300 focus:border-amber-400 rounded px-1.5 py-0.5 outline-none"
                  style={{ width: `${Math.max(10, data.invoice.number.length + 2)}ch` }}
                  title="Click to edit invoice number"
                />
              </div>
            </div>

            {/* Right: Company Details (Only rendered if provided, no default placeholders) */}
            <div className="text-right max-w-[380px] flex flex-col items-end pt-1">
              {/* 1. Company Name */}
              {data.company.name ? (
                <h2 className="text-[20px] font-black uppercase tracking-tight text-slate-950 leading-tight">
                  {data.company.name}
                </h2>
              ) : null}

              {/* 2. City / Address with subtle divider line */}
              {data.company.address ? (
                <p className="text-xs font-bold text-slate-800 uppercase tracking-wide mt-0.5 mb-1 pb-1 border-b border-slate-200 w-full text-right">
                  {data.company.address}
                </p>
              ) : null}

              {/* 3. Phone */}
              {data.company.phone ? (
                <p className="text-[13px] font-bold font-mono text-slate-950 mt-1 leading-snug">
                  {data.company.phone}
                </p>
              ) : null}

              {/* 4. Email */}
              {data.company.email ? (
                <p className="text-xs text-slate-700 font-medium leading-snug">
                  {data.company.email}
                </p>
              ) : null}

              {/* 5. Website */}
              {data.company.website ? (
                <p className="text-xs text-slate-700 font-medium leading-snug">
                  {data.company.website}
                </p>
              ) : null}

              {/* Optional GSTIN / Registration Number */}
              {data.company.customInfo ? (
                <div className="pt-1">
                  <span className="text-[9px] font-bold text-slate-700 bg-slate-100 border border-slate-300 px-2 py-0.5 rounded uppercase tracking-wider inline-block">
                    {data.company.customInfo}
                  </span>
                </div>
              ) : null}

              {/* 6. ISSUED ON & Date */}
              <div className="mt-2.5 text-right">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-900 block leading-none">
                  ISSUED ON
                </span>
                <input 
                  type="text" 
                  value={data.invoice.date || ''}
                  onChange={(e) => updateField('invoice', 'date', e.target.value)}
                  className="font-mono font-bold text-xs text-slate-900 mt-1 leading-none bg-transparent hover:bg-slate-100 focus:bg-white border border-transparent hover:border-slate-300 focus:border-amber-400 rounded px-1.5 py-0.5 outline-none text-right"
                  style={{ width: `${Math.max(10, (data.invoice.date || '').length + 2)}ch` }}
                  title="Click to edit date"
                />
              </div>
            </div>
          </div>

          {/* 2. Passenger Details (Clean, Service Type Block Completely Removed) */}
          <div className="py-3.5 border-b border-slate-200/90 flex justify-between items-center">
            {/* Passenger */}
            <div className="text-left">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                PASSENGER DETAILS
              </span>
              <p className="text-sm font-black text-slate-900 leading-tight">
                {data.passenger.name || "Customer"}
              </p>
              <p className="text-xs text-slate-600 font-mono mt-0.5 leading-tight font-semibold">
                {data.passenger.phone ? `Mobile: +91 ${data.passenger.phone}` : "Mobile: —"}
              </p>
            </div>
          </div>

          {/* 3. Trip Route Addresses & Timing Card */}
          <div className="my-3.5 bg-slate-50 border border-slate-200 rounded-2xl p-4">
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 block mb-2.5">
              TRIP ROUTE & DESTINATION
            </span>

            <div className="relative pl-6 space-y-3">
              {/* Connecting Dotted Line */}
              <div className="absolute left-[7px] top-[12px] bottom-[12px] w-0 border-l-[2px] border-dashed border-slate-400" />

              {/* Pickup Point */}
              <div className="relative flex items-start">
                <div className="absolute -left-[23px] top-1 w-3 h-3 rounded-full bg-emerald-600 ring-4 ring-emerald-100 shrink-0" />
                <div>
                  <span className="text-[9px] font-bold uppercase text-emerald-700 block leading-none">
                    PICKUP LOCATION
                  </span>
                  <p className="text-xs text-slate-900 leading-snug mt-1 font-semibold">
                    {data.trip.pickup || "Pickup Location not specified"}
                  </p>
                </div>
              </div>

              {/* Dropoff Point */}
              <div className="relative flex items-start">
                <div className="absolute -left-[23px] top-1 w-3 h-3 rounded-full bg-rose-600 ring-4 ring-rose-100 shrink-0" />
                <div>
                  <span className="text-[9px] font-bold uppercase text-rose-700 block leading-none">
                    DROPOFF LOCATION
                  </span>
                  <p className="text-xs text-slate-900 leading-snug mt-1 font-semibold">
                    {data.trip.drop || "Dropoff Location not specified"}
                  </p>
                </div>
              </div>
            </div>

            {/* Timings & Route Map row */}
            {(data.trip.startTime || data.trip.endTime || data.trip.duration || data.trip.routeMap) && (
              <div className="mt-3 pt-2.5 border-t border-slate-200/90 flex flex-wrap items-center justify-between text-xs text-slate-600 font-medium gap-2">
                <div className="flex items-center space-x-4 flex-wrap">
                  {data.trip.startTime && <span><strong>Start:</strong> {data.trip.startTime}</span>}
                  {data.trip.endTime && <span><strong>End:</strong> {data.trip.endTime}</span>}
                  {data.trip.duration && <span><strong>Duration:</strong> {data.trip.duration}</span>}
                </div>
                {data.trip.routeMap && (
                  <a 
                    href={data.trip.routeMap} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-[11px] font-bold text-blue-600 hover:underline flex items-center gap-1"
                  >
                    <span>View Route Map ↗</span>
                  </a>
                )}
              </div>
            )}
          </div>

          {/* 4. Spacious Vehicle & Driver Details Section (Single Page, NO DRIVER PHOTO) */}
          <div className="my-3.5 bg-slate-50 border border-slate-200 rounded-2xl p-4 flex justify-between items-center">
            <div className="grid grid-cols-3 gap-6 text-left flex-1">
              <div>
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 block">
                  ASSIGNED DRIVER
                </span>
                <p className="text-sm font-black text-slate-900 mt-1 min-h-[1.25rem]">
                  {data.driver.name || ""}
                </p>
              </div>

              <div>
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 block">
                  VEHICLE CATEGORY
                </span>
                <p className="text-sm font-black text-slate-900 mt-1 min-h-[1.25rem]">
                  {(data.vehicle.type || "").replace(/\s*taxi\s*/gi, '').trim() || ""}
                </p>
              </div>

              <div>
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 block">
                  VEHICLE REG NO
                </span>
                <p className="text-sm font-mono font-black text-slate-900 mt-1 min-h-[1.25rem]">
                  {data.vehicle.number || ""}
                </p>
              </div>
            </div>

            {/* Distance / Package stats on right */}
            <div className="text-right pl-6 border-l border-slate-200 shrink-0">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 block">
                TRAVEL DISTANCE
              </span>
              <p className="text-[20px] font-black text-slate-900 leading-none my-1">
                {(data.fare.distance || 0).toFixed(2)} KM
              </p>
              {pricingType === 'hourly' && (
                <p className="text-[10px] font-bold text-slate-600">
                  Package: {data.fare.hours || 1} Hr / {data.fare.packageKm || 10} KM Included
                </p>
              )}
            </div>
          </div>

          {/* 5. Charges Breakdown Table */}
          <div className="my-3.5 flex-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-2">
              FARE BREAKDOWN & CHARGES
            </span>

            <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
              <div className="divide-y divide-slate-100">
                {/* Base Fare */}
                {data.fare.baseFare > 0 && (
                  <div className="flex justify-between items-center px-4 py-2 bg-white">
                    <span className="font-medium text-slate-800">
                      {pricingType === 'hourly' 
                        ? `Package Base Fare (${data.fare.hours || 1} Hr / ${data.fare.packageKm || 10} KM Included)` 
                        : 'Base Fare'}
                    </span>
                    <span className="font-bold text-slate-900">₹{data.fare.baseFare.toFixed(2)}</span>
                  </div>
                )}
                
                {/* Hourly Rental Time */}
                {((data.fare.hours || 0) > 0 && (data.fare.ratePerHour || 0) > 0) && (
                  <div className="flex justify-between items-center px-4 py-2 bg-slate-50/50">
                    <span className="font-medium text-slate-800">
                      Rental Time ({data.fare.hours} Hr @ ₹{(data.fare.ratePerHour || 0) % 1 === 0 ? data.fare.ratePerHour : (data.fare.ratePerHour || 0).toFixed(2)}/Hr)
                    </span>
                    <span className="font-bold text-slate-900">
                      ₹{((data.fare.hours || 0) * (data.fare.ratePerHour || 0)).toFixed(2)}
                    </span>
                  </div>
                )}

                {/* Distance Fare */}
                {(data.fare.distanceFare !== undefined ? data.fare.distanceFare > 0 : ((data.fare.distance || 0) > 0 && (data.fare.ratePerKm || 0) > 0)) && (
                  <div className="flex justify-between items-center px-4 py-2 bg-white">
                    <span className="font-medium text-slate-800">
                      Distance Fare
                      {(data.fare.distance || 0) > 0
                        ? ` (${(data.fare.distance || 0) % 1 === 0 ? data.fare.distance : (data.fare.distance || 0).toFixed(1)} KM${(data.fare.ratePerKm || 0) > 0 ? ` @ ₹${(data.fare.ratePerKm || 0) % 1 === 0 ? data.fare.ratePerKm : (data.fare.ratePerKm || 0).toFixed(2)}/KM` : ''})`
                        : ''}
                    </span>
                    <span className="font-bold text-slate-900">
                      ₹{(data.fare.distanceFare !== undefined ? data.fare.distanceFare : ((data.fare.distance || 0) * (data.fare.ratePerKm || 0))).toFixed(2)}
                    </span>
                  </div>
                )}

                {/* Extra Distance */}
                {((data.fare.extraKmsFare !== undefined && data.fare.extraKmsFare > 0) || ((data.fare.extraKms || 0) > 0 && (data.fare.extraKmsRate || 0) > 0)) && (
                  <div className="flex justify-between items-center px-4 py-2 bg-slate-50/50">
                    <span className="font-medium text-slate-800">
                      Extra Distance
                      {(data.fare.extraKms || 0) > 0
                        ? ` (${(data.fare.extraKms || 0) % 1 === 0 ? data.fare.extraKms : (data.fare.extraKms || 0).toFixed(1)} KM${(data.fare.extraKmsRate || 0) > 0 ? ` @ ₹${(data.fare.extraKmsRate || 0) % 1 === 0 ? data.fare.extraKmsRate : (data.fare.extraKmsRate || 0).toFixed(2)}/KM` : ''})`
                        : ''}
                    </span>
                    <span className="font-bold text-slate-900">
                      ₹{(data.fare.extraKmsFare !== undefined ? data.fare.extraKmsFare : ((data.fare.extraKms || 0) * (data.fare.extraKmsRate || 0))).toFixed(2)}
                    </span>
                  </div>
                )}

                {/* Extra Time */}
                {((data.fare.extraTimeFare !== undefined && data.fare.extraTimeFare > 0) || ((data.fare.extraTime || 0) > 0 && (data.fare.extraTimeRate || 0) > 0)) && (
                  <div className="flex justify-between items-center px-4 py-2 bg-slate-50/50">
                    <span className="font-medium text-slate-800">
                      Extra Time
                      {(data.fare.extraTime || 0) > 0
                        ? ` (${data.fare.extraTime} ${data.fare.extraTimeUnit === 'hours' ? 'Hr' : 'Mins'}${(data.fare.extraTimeRate || 0) > 0 ? ` @ ₹${(data.fare.extraTimeRate || 0) % 1 === 0 ? data.fare.extraTimeRate : (data.fare.extraTimeRate || 0).toFixed(2)}/${data.fare.extraTimeUnit === 'hours' ? 'Hr' : 'Min'}` : ''})`
                        : ''}
                    </span>
                    <span className="font-bold text-slate-900">
                      ₹{(data.fare.extraTimeFare !== undefined && data.fare.extraTimeFare > 0
                        ? data.fare.extraTimeFare
                        : ((data.fare.extraTime || 0) * (data.fare.extraTimeRate || 0))).toFixed(2)}
                    </span>
                  </div>
                )}
                {(data.fare.waitingFare !== undefined ? data.fare.waitingFare > 0 : (data.fare.waitingMinutes > 0 && data.fare.waitingRate > 0)) && (
                  <div className="flex justify-between items-center px-4 py-2 bg-white">
                    <span className="font-medium text-slate-800">
                      Waiting Fare
                      {data.fare.waitingMinutes > 0 && data.fare.waitingRate > 0
                        ? ` (${data.fare.waitingMinutes} Mins @ ₹${data.fare.waitingRate % 1 === 0 ? data.fare.waitingRate : data.fare.waitingRate.toFixed(2)}/Min)`
                        : ''}
                    </span>
                    <span className="font-bold text-slate-900">
                      ₹{(data.fare.waitingFare !== undefined ? data.fare.waitingFare : (data.fare.waitingMinutes * data.fare.waitingRate)).toFixed(2)}
                    </span>
                  </div>
                )}
                {data.fare.minFareAdjustment !== undefined && data.fare.minFareAdjustment > 0 && (
                  <div className="flex justify-between items-center px-4 py-2 bg-slate-50/50">
                    <span className="font-medium text-slate-800">Minimum Fare Adjustment</span>
                    <span className="font-bold text-slate-900">₹{data.fare.minFareAdjustment.toFixed(2)}</span>
                  </div>
                )}
                {data.fare.toll > 0 && (
                  <div className="flex justify-between items-center px-4 py-2 bg-white">
                    <span className="font-medium text-slate-800">Toll & Parking Charges</span>
                    <span className="font-bold text-slate-900">₹{data.fare.toll.toFixed(2)}</span>
                  </div>
                )}
                {data.fare.permit > 0 && (
                  <div className="flex justify-between items-center px-4 py-2 bg-slate-50/50">
                    <span className="font-medium text-slate-800">Permit Charges</span>
                    <span className="font-bold text-slate-900">₹{data.fare.permit.toFixed(2)}</span>
                  </div>
                )}
                {data.fare.extraCharges > 0 && (
                  <div className="flex justify-between items-center px-4 py-2 bg-white">
                    <span className="font-medium text-slate-800">Other Charges</span>
                    <span className="font-bold text-slate-900">₹{data.fare.extraCharges.toFixed(2)}</span>
                  </div>
                )}
                {data.fare.driverBata > 0 && (
                  <div className="flex justify-between items-center px-4 py-2 bg-slate-50/50">
                    <span className="font-medium text-slate-800">Driver Bata</span>
                    <span className="font-bold text-slate-900">₹{data.fare.driverBata.toFixed(2)}</span>
                  </div>
                )}
                {data.fare.peakCharge > 0 && (
                  <div className="flex justify-between items-center px-4 py-2 bg-white">
                    <span className="font-medium text-slate-800">Peak Charge</span>
                    <span className="font-bold text-slate-900">₹{data.fare.peakCharge.toFixed(2)}</span>
                  </div>
                )}
                {data.fare.surcharge > 0 && (
                  <div className="flex justify-between items-center px-4 py-2 bg-slate-50/50">
                    <span className="font-medium text-slate-800">Night Surcharge Premium</span>
                    <span className="font-bold text-slate-900">₹{data.fare.surcharge.toFixed(2)}</span>
                  </div>
                )}
                {data.fare.dayRent > 0 && (
                  <div className="flex justify-between items-center px-4 py-2 bg-white">
                    <span className="font-medium text-slate-800">Day Rent</span>
                    <span className="font-bold text-slate-900">₹{data.fare.dayRent.toFixed(2)}</span>
                  </div>
                )}
                {data.fare.hillsCharge > 0 && (
                  <div className="flex justify-between items-center px-4 py-2 bg-slate-50/50">
                    <span className="font-medium text-slate-800">Hills Charge</span>
                    <span className="font-bold text-slate-900">₹{data.fare.hillsCharge.toFixed(2)}</span>
                  </div>
                )}
                {data.fare.taxPercentage > 0 && (
                  <div className="flex justify-between items-center px-4 py-2 bg-white">
                    <span className="font-medium text-slate-800">{data.fare.taxLabel || 'GST'} ({data.fare.taxPercentage}%)</span>
                    <span className="font-bold text-slate-900">₹{totals.taxAmount.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 6. Grand Total Card & Terms */}
          <div className="pt-2 flex justify-between items-start gap-6 mb-3">
            {/* Left: Terms */}
            <div className="flex-1 pt-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700 block mb-1">
                TERMS & CONDITIONS
              </span>
              <p className="text-[10px] text-slate-600 leading-snug">
                • Toll, parking, permit, and other charges are additional as per actual receipts.
              </p>
              <p className="text-[10px] text-slate-600 leading-snug mt-0.5">
                • Thank you for travelling with us. Wish you a safe journey!
              </p>
              {data.notes && (
                <p className="text-[10px] text-slate-700 font-semibold leading-snug mt-0.5">
                  • {data.notes}
                </p>
              )}
            </div>

            {/* Right: Grand Total Box */}
            <div className="w-[260px] bg-slate-100 border border-slate-300 rounded-2xl p-4 shrink-0 shadow-xs">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-xs font-bold text-slate-900 uppercase">GRAND TOTAL</span>
                <span className="text-[20px] font-black text-slate-950">₹{totals.grandTotal.toFixed(2)}</span>
              </div>
              <div className="h-px bg-slate-300 my-1.5" />
              {data.fare.advancePaid > 0 && (
                <>
                  <div className="flex justify-between items-center mb-1 text-xs text-rose-600 font-semibold">
                    <span>Advance Paid</span>
                    <span>- ₹{data.fare.advancePaid.toFixed(2)}</span>
                  </div>
                  <div className="h-px bg-slate-300 my-1.5" />
                </>
              )}
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-blue-700 uppercase">Balance Payable</span>
                <span className="text-[18px] font-black text-blue-700">₹{totals.balance.toFixed(2)}</span>
              </div>
            </div>
          </div>

        </div>

        {/* 7. Footer Section */}
        <div className="pt-2 border-t border-slate-200">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-900 text-center mb-0.5">
            THANK YOU FOR TRAVELLING WITH US
          </p>
          <p className="text-[9px] text-slate-500 text-center">
            This is a computer generated invoice. No physical signature is required.
          </p>
        </div>

      </div>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col bg-[#FDCB58] w-full text-[#1A1A1A] font-sans">
      
      {/* Background Offscreen Invoice Container (Always active at 0,0 with z-index -9999 so PDF download and WhatsApp buttons always work instantly) */}
      <div 
        id="pdf-render-staging"
        className="fixed top-0 left-0 pointer-events-none opacity-100 z-[-9999] overflow-hidden"
        style={{ width: '210mm', height: '297mm' }}
        aria-hidden="true"
      >
        {renderInvoiceTemplate('receipt-page-export')}
      </div>

      {/* Top Yellow Half - Clean breathing room */}
      <div className="py-7 sm:py-9 px-4 sm:px-6 text-center text-slate-950 relative max-w-xl mx-auto w-full no-print">
        
        {/* Mode Switcher Pill in Hero */}
        <div className="inline-flex p-1.5 bg-black/10 rounded-2xl text-xs font-bold text-slate-950 backdrop-blur-xs shadow-inner/10">
          <button
            type="button"
            onClick={() => {
              setBillingTab('paste');
              setShowPreview(false);
            }}
            className={`px-4 sm:px-5 py-2 rounded-xl transition-all cursor-pointer ${
              billingTab === 'paste' && !showPreview
                ? 'bg-white text-slate-950 shadow-xs'
                : 'text-slate-900/75 hover:text-slate-950'
            }`}
          >
            <span>Paste Booking</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setBillingTab('manual');
              setShowPreview(false);
            }}
            className={`px-4 sm:px-5 py-2 rounded-xl transition-all cursor-pointer ${
              billingTab === 'manual' && !showPreview
                ? 'bg-white text-slate-950 shadow-xs'
                : 'text-slate-900/75 hover:text-slate-950'
            }`}
          >
            <span>Manual Edit</span>
          </button>

          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className={`px-4 sm:px-5 py-2 rounded-xl transition-all cursor-pointer flex items-center space-x-1.5 ${
              showPreview
                ? 'bg-white text-slate-950 shadow-xs'
                : 'text-slate-900/75 hover:text-slate-950'
            }`}
          >
            <Eye size={13} className="stroke-[2.5]" />
            <span>{showPreview ? "Edit Mode" : "Preview PDF"}</span>
          </button>
        </div>

      </div>

      {/* Bottom White Section - Sweeps across full width */}
      <div className="flex-1 bg-white rounded-tl-[48px] sm:rounded-tl-[64px] pt-8 sm:pt-10 pb-16 sm:pb-20 px-4 sm:px-8 shadow-[0_-12px_30px_rgba(0,0,0,0.03)] w-full">
        <main className="max-w-4xl mx-auto space-y-6 sm:space-y-7">

          {/* Clean Responsive Utility & Action Bar */}
          <div className="bg-slate-50/90 border border-slate-200/90 rounded-2xl p-3 sm:p-4 flex items-center justify-between gap-3 shadow-2xs flex-wrap">
            <button 
              type="button"
              onClick={resetData}
              className="flex items-center space-x-1.5 px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-800 text-xs font-bold rounded-xl border border-slate-200/80 transition-all cursor-pointer shadow-2xs active:scale-95"
              title="Start fresh new bill"
            >
              <RotateCcw size={13} />
              <span>New Bill</span>
            </button>

            {/* Quick Action Buttons - Only on Preview PDF page */}
            {showPreview ? (
              <div className="flex items-center gap-2 sm:gap-2.5">
                <button
                  type="button"
                  onClick={shareWhatsApp}
                  disabled={isGenerating}
                  className="h-9 sm:h-9.5 px-3.5 sm:px-4 bg-[#25D366] hover:bg-[#20bd5a] active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title="Share via WhatsApp"
                >
                  <Share2 size={13} className="stroke-[2.2]" />
                  <span>WhatsApp</span>
                </button>

                <button
                  type="button"
                  onClick={downloadPDF}
                  disabled={isGenerating}
                  className="h-9 sm:h-9.5 px-4 sm:px-4.5 bg-amber-400 hover:bg-amber-300 active:scale-95 text-slate-950 font-black text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 border border-amber-500/20"
                  title="Download 1-Page PDF"
                >
                  <Download size={13} className={`stroke-[2.5] ${isGenerating ? "animate-bounce" : ""}`} />
                  <span>Download PDF</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowPreview(true)}
                className="h-9 sm:h-9.5 px-4 bg-amber-400 hover:bg-amber-300 active:scale-95 text-slate-950 font-black text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer border border-amber-500/20"
                title="Preview PDF"
              >
                <Eye size={13} className="stroke-[2.5]" />
                <span>Preview PDF</span>
              </button>
            )}
          </div>
        {!showPreview ? (
          billingTab === 'paste' ? (
            /* DEDICATED DEFAULT VIEW: Paste Booking & Quick Actions */
            <div className="space-y-6">
              <section className="bg-white rounded-2xl p-6 sm:p-7 shadow-xs border border-slate-200/90 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <label className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Paste Ride Receipt
                  </label>
                  
                  {/* Modern Short Action Buttons: Paste & Clear */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handlePasteFromClipboard}
                      className="px-3.5 py-2 bg-amber-400 hover:bg-amber-300 active:scale-95 text-slate-950 text-xs font-black rounded-xl shadow-xs flex items-center gap-1.5 transition-all cursor-pointer border border-amber-500/20"
                      title="Paste from clipboard"
                    >
                      <ClipboardPaste size={14} className="stroke-[2.5]" />
                      <span>Paste</span>
                    </button>
                    {pastedText && (
                      <button
                        type="button"
                        onClick={() => {
                          setPastedText('');
                        }}
                        className="px-3 py-2 bg-rose-50 hover:bg-rose-100 active:scale-95 text-rose-600 text-xs font-bold rounded-xl border border-rose-200/80 transition-all flex items-center gap-1 cursor-pointer shadow-xs"
                        title="Clear pasted text"
                      >
                        <Trash2 size={13} />
                        <span>Clear</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Short, Modern Sleek Textarea with generous height */}
                <textarea
                  value={pastedText}
                  onChange={(e) => handleProcessPastedText(e.target.value)}
                  placeholder=""
                  rows={4}
                  className="w-full bg-slate-50/70 hover:bg-slate-50 focus:bg-white border border-slate-200 focus:border-amber-400 focus:ring-4 focus:ring-amber-400/20 rounded-xl px-4 py-3 text-xs sm:text-sm font-mono text-slate-900 placeholder:text-slate-400 outline-none transition-all resize-y min-h-[96px] leading-relaxed shadow-inner/5"
                />
              </section>
            </div>
          ) : (
            /* SECONDARY VIEW: Clean App-Style Manual Edit Interface (Reference Style with Yellow Brand Theme) */
            <div className="space-y-6">
              {/* Card 1: Invoice, Passenger & Route Details */}
              <section className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-200/80 space-y-4">
                <div className="border-b border-slate-100 pb-2.5 flex items-center justify-between flex-wrap gap-2">
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                    Invoice, Passenger & Route
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {/* Trip / Invoice Date */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                      <span>Trip / Invoice Date</span>
                      {data.invoice.date && (
                        <span className="text-[10px] text-slate-400 font-normal">
                          {formatReceiptDate(data.invoice.date)}
                        </span>
                      )}
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="date"
                        value={data.invoice.date || ''}
                        onChange={(e) => updateField('invoice', 'date', e.target.value)}
                        className="w-full bg-slate-50/90 hover:bg-slate-100/70 focus:bg-white border border-slate-200/80 focus:border-amber-400 focus:ring-4 focus:ring-amber-400/20 rounded-2xl px-4 py-2.5 text-xs font-mono font-bold text-slate-900 outline-none transition-all shadow-2xs cursor-pointer"
                      />
                      {data.invoice.date && (
                        <div className="absolute right-3 w-5 h-5 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center shadow-xs pointer-events-none">
                          <Check size={11} className="stroke-[3]" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Invoice / Bill Number */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Invoice Number
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        value={data.invoice.number}
                        onChange={(e) => updateField('invoice', 'number', e.target.value)}
                        placeholder=""
                        className="w-full bg-slate-50/90 hover:bg-slate-100/70 focus:bg-white border border-slate-200/80 focus:border-amber-400 focus:ring-4 focus:ring-amber-400/20 rounded-2xl pl-4 pr-10 py-2.5 text-xs font-mono font-bold text-slate-900 outline-none transition-all shadow-2xs"
                      />
                      {data.invoice.number && (
                        <button
                          type="button"
                          onClick={() => updateField('invoice', 'number', '')}
                          className="absolute right-2.5 w-6 h-6 rounded-full bg-amber-400 hover:bg-rose-500 text-slate-950 hover:text-white flex items-center justify-center shadow-xs transition-colors cursor-pointer group"
                          title="Click to clear"
                        >
                          <Check size={11} className="stroke-[3] group-hover:hidden" />
                          <X size={12} className="stroke-[3] hidden group-hover:block" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Customer Name */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Customer Name
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        value={data.passenger.name}
                        onChange={(e) => updateField('passenger', 'name', e.target.value)}
                        placeholder=""
                        className="w-full bg-slate-50/90 hover:bg-slate-100/70 focus:bg-white border border-slate-200/80 focus:border-amber-400 focus:ring-4 focus:ring-amber-400/20 rounded-2xl pl-4 pr-10 py-2.5 text-xs font-bold text-slate-900 outline-none transition-all shadow-2xs"
                      />
                      {data.passenger.name && (
                        <button
                          type="button"
                          onClick={() => updateField('passenger', 'name', '')}
                          className="absolute right-2.5 w-6 h-6 rounded-full bg-amber-400 hover:bg-rose-500 text-slate-950 hover:text-white flex items-center justify-center shadow-xs transition-colors cursor-pointer group"
                          title="Click to clear"
                        >
                          <Check size={11} className="stroke-[3] group-hover:hidden" />
                          <X size={12} className="stroke-[3] hidden group-hover:block" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Customer Phone */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Customer Mobile Number
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="tel"
                        value={data.passenger.phone}
                        onChange={(e) => updateField('passenger', 'phone', e.target.value)}
                        placeholder=""
                        className="w-full bg-slate-50/90 hover:bg-slate-100/70 focus:bg-white border border-slate-200/80 focus:border-amber-400 focus:ring-4 focus:ring-amber-400/20 rounded-2xl pl-4 pr-10 py-2.5 text-xs font-mono font-bold text-slate-900 outline-none transition-all shadow-2xs"
                      />
                      {data.passenger.phone && (
                        <button
                          type="button"
                          onClick={() => updateField('passenger', 'phone', '')}
                          className="absolute right-2.5 w-6 h-6 rounded-full bg-amber-400 hover:bg-rose-500 text-slate-950 hover:text-white flex items-center justify-center shadow-xs transition-colors cursor-pointer group"
                          title="Click to clear"
                        >
                          <Check size={11} className="stroke-[3] group-hover:hidden" />
                          <X size={12} className="stroke-[3] hidden group-hover:block" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Pickup Location */}
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-emerald-800 mb-1.5 flex items-center space-x-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                      <span>Pickup Point</span>
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        value={data.trip.pickup}
                        onChange={(e) => updateField('trip', 'pickup', e.target.value)}
                        placeholder=""
                        className="w-full bg-slate-50/90 hover:bg-slate-100/70 focus:bg-white border border-slate-200/80 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 rounded-2xl pl-4 pr-10 py-2.5 text-xs font-medium text-slate-900 outline-none transition-all shadow-2xs"
                      />
                      {data.trip.pickup && (
                        <button
                          type="button"
                          onClick={() => updateField('trip', 'pickup', '')}
                          className="absolute right-2.5 w-6 h-6 rounded-full bg-amber-400 hover:bg-rose-500 text-slate-950 hover:text-white flex items-center justify-center shadow-xs transition-colors cursor-pointer group"
                          title="Click to clear"
                        >
                          <Check size={11} className="stroke-[3] group-hover:hidden" />
                          <X size={12} className="stroke-[3] hidden group-hover:block" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Dropoff Location */}
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-rose-800 mb-1.5 flex items-center space-x-1.5">
                      <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
                      <span>Dropoff Point</span>
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        value={data.trip.drop}
                        onChange={(e) => updateField('trip', 'drop', e.target.value)}
                        placeholder=""
                        className="w-full bg-slate-50/90 hover:bg-slate-100/70 focus:bg-white border border-slate-200/80 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/20 rounded-2xl pl-4 pr-10 py-2.5 text-xs font-medium text-slate-900 outline-none transition-all shadow-2xs"
                      />
                      {data.trip.drop && (
                        <button
                          type="button"
                          onClick={() => updateField('trip', 'drop', '')}
                          className="absolute right-2.5 w-6 h-6 rounded-full bg-amber-400 hover:bg-rose-500 text-slate-950 hover:text-white flex items-center justify-center shadow-xs transition-colors cursor-pointer group"
                          title="Click to clear"
                        >
                          <Check size={11} className="stroke-[3] group-hover:hidden" />
                          <X size={12} className="stroke-[3] hidden group-hover:block" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Timings */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Start Time
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        value={data.trip.startTime || ''}
                        onChange={(e) => updateField('trip', 'startTime', e.target.value)}
                        placeholder=""
                        className="w-full bg-slate-50/90 hover:bg-slate-100/70 focus:bg-white border border-slate-200/80 focus:border-amber-400 focus:ring-4 focus:ring-amber-400/20 rounded-2xl pl-4 pr-10 py-2.5 text-xs font-medium text-slate-900 outline-none transition-all shadow-2xs"
                      />
                      {data.trip.startTime && (
                        <button
                          type="button"
                          onClick={() => updateField('trip', 'startTime', '')}
                          className="absolute right-2.5 w-6 h-6 rounded-full bg-amber-400 hover:bg-rose-500 text-slate-950 hover:text-white flex items-center justify-center shadow-xs transition-colors cursor-pointer group"
                          title="Click to clear"
                        >
                          <Check size={11} className="stroke-[3] group-hover:hidden" />
                          <X size={12} className="stroke-[3] hidden group-hover:block" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      End Time
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        value={data.trip.endTime || ''}
                        onChange={(e) => updateField('trip', 'endTime', e.target.value)}
                        placeholder=""
                        className="w-full bg-slate-50/90 hover:bg-slate-100/70 focus:bg-white border border-slate-200/80 focus:border-amber-400 focus:ring-4 focus:ring-amber-400/20 rounded-2xl pl-4 pr-10 py-2.5 text-xs font-medium text-slate-900 outline-none transition-all shadow-2xs"
                      />
                      {data.trip.endTime && (
                        <button
                          type="button"
                          onClick={() => updateField('trip', 'endTime', '')}
                          className="absolute right-2.5 w-6 h-6 rounded-full bg-amber-400 hover:bg-rose-500 text-slate-950 hover:text-white flex items-center justify-center shadow-xs transition-colors cursor-pointer group"
                          title="Click to clear"
                        >
                          <Check size={11} className="stroke-[3] group-hover:hidden" />
                          <X size={12} className="stroke-[3] hidden group-hover:block" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              {/* Card 2: Vehicle & Driver Assignment */}
              <section className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-200/80 space-y-4">
                <div className="border-b border-slate-100 pb-2.5">
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                    Vehicle & Driver
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  {/* Vehicle Type */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Vehicle Category
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        list="vehicle-categories-list"
                        value={data.vehicle.type}
                        onChange={(e) => updateField('vehicle', 'type', e.target.value)}
                        placeholder=""
                        className="w-full bg-slate-50/90 hover:bg-slate-100/70 focus:bg-white border border-slate-200/80 focus:border-amber-400 focus:ring-4 focus:ring-amber-400/20 rounded-2xl pl-4 pr-10 py-2.5 text-xs font-bold text-slate-900 outline-none transition-all shadow-2xs"
                      />
                      <datalist id="vehicle-categories-list">
                        <option value="Mini" />
                        <option value="Sedan" />
                        <option value="SUV" />
                        <option value="SUV+" />
                        <option value="Innova" />
                      </datalist>
                      {data.vehicle.type && (
                        <button
                          type="button"
                          onClick={() => updateField('vehicle', 'type', '')}
                          className="absolute right-2.5 w-6 h-6 rounded-full bg-amber-400 hover:bg-rose-500 text-slate-950 hover:text-white flex items-center justify-center shadow-xs transition-colors cursor-pointer group"
                          title="Click to clear"
                        >
                          <Check size={11} className="stroke-[3] group-hover:hidden" />
                          <X size={12} className="stroke-[3] hidden group-hover:block" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Vehicle Reg No */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Vehicle Reg Number
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        value={data.vehicle.number}
                        onChange={(e) => updateField('vehicle', 'number', e.target.value)}
                        placeholder=""
                        className="w-full bg-slate-50/90 hover:bg-slate-100/70 focus:bg-white border border-slate-200/80 focus:border-amber-400 focus:ring-4 focus:ring-amber-400/20 rounded-2xl pl-4 pr-10 py-2.5 text-xs font-mono font-bold text-slate-900 uppercase outline-none transition-all shadow-2xs"
                      />
                      {data.vehicle.number && (
                        <button
                          type="button"
                          onClick={() => updateField('vehicle', 'number', '')}
                          className="absolute right-2.5 w-6 h-6 rounded-full bg-amber-400 hover:bg-rose-500 text-slate-950 hover:text-white flex items-center justify-center shadow-xs transition-colors cursor-pointer group"
                          title="Click to clear"
                        >
                          <Check size={11} className="stroke-[3] group-hover:hidden" />
                          <X size={12} className="stroke-[3] hidden group-hover:block" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Assigned Driver */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Assigned Driver
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        value={data.driver.name}
                        onChange={(e) => updateField('driver', 'name', e.target.value)}
                        placeholder=""
                        className="w-full bg-slate-50/90 hover:bg-slate-100/70 focus:bg-white border border-slate-200/80 focus:border-amber-400 focus:ring-4 focus:ring-amber-400/20 rounded-2xl pl-4 pr-10 py-2.5 text-xs font-bold text-slate-900 outline-none transition-all shadow-2xs"
                      />
                      {data.driver.name && (
                        <button
                          type="button"
                          onClick={() => updateField('driver', 'name', '')}
                          className="absolute right-2.5 w-6 h-6 rounded-full bg-amber-400 hover:bg-rose-500 text-slate-950 hover:text-white flex items-center justify-center shadow-xs transition-colors cursor-pointer group"
                          title="Click to clear"
                        >
                          <Check size={11} className="stroke-[3] group-hover:hidden" />
                          <X size={12} className="stroke-[3] hidden group-hover:block" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              {/* Card 3: Distance, Rates & Rental Pricing */}
              <section className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-200/80 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 flex-wrap gap-2">
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                    Trip Rates & Distance Calculation
                  </h3>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
                  {/* Base / Package Fare (₹) */}
                  <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/70 shadow-2xs">
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Base / Package Fare (₹)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={getFareDisplayValue('baseFare')}
                      placeholder="0.00"
                      onChange={(e) => handleFareInputChange('baseFare', e.target.value)}
                      onWheel={(e) => (e.target as HTMLElement).blur()}
                      className="w-full bg-white border border-slate-200/90 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
                    />
                  </div>

                  {/* Distance (KM) */}
                  <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/70 shadow-2xs">
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Distance (KM)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={getFareDisplayValue('distance')}
                      placeholder="0.00"
                      onChange={(e) => handleFareInputChange('distance', e.target.value)}
                      onWheel={(e) => (e.target as HTMLElement).blur()}
                      className="w-full bg-white border border-slate-200/90 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
                    />
                  </div>

                  {/* Rate / KM (₹) */}
                  <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/70 shadow-2xs">
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Rate / KM (₹)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={getFareDisplayValue('ratePerKm')}
                      placeholder=""
                      onChange={(e) => handleFareInputChange('ratePerKm', e.target.value)}
                      onWheel={(e) => (e.target as HTMLElement).blur()}
                      className="w-full bg-white border border-slate-200/90 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
                    />
                  </div>

                  {/* Hours */}
                  <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/70 shadow-2xs">
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Hours
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={getFareDisplayValue('hours')}
                      placeholder="0"
                      onChange={(e) => handleFareInputChange('hours', e.target.value)}
                      onWheel={(e) => (e.target as HTMLElement).blur()}
                      className="w-full bg-white border border-slate-200/90 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
                    />
                  </div>

                  {/* Rate / Hour (₹) */}
                  <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/70 shadow-2xs">
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Rate / Hour (₹)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={getFareDisplayValue('ratePerHour')}
                      placeholder=""
                      onChange={(e) => handleFareInputChange('ratePerHour', e.target.value)}
                      onWheel={(e) => (e.target as HTMLElement).blur()}
                      className="w-full bg-white border border-slate-200/90 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
                    />
                  </div>

                  {/* Extra KMs */}
                  <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/70 shadow-2xs">
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Extra KMs
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={getFareDisplayValue('extraKms')}
                      placeholder="0.00"
                      onChange={(e) => handleFareInputChange('extraKms', e.target.value)}
                      onWheel={(e) => (e.target as HTMLElement).blur()}
                      className="w-full bg-white border border-slate-200/90 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
                    />
                  </div>

                  {/* Rate / Extra KM (₹) */}
                  <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/70 shadow-2xs">
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Rate / Extra KM (₹)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={getFareDisplayValue('extraKmsRate')}
                      placeholder=""
                      onChange={(e) => handleFareInputChange('extraKmsRate', e.target.value)}
                      onWheel={(e) => (e.target as HTMLElement).blur()}
                      className="w-full bg-white border border-slate-200/90 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
                    />
                  </div>

                  {/* Extra Time */}
                  <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/70 shadow-2xs">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                        Extra Time
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const nextUnit = data.fare.extraTimeUnit === 'hours' ? 'mins' : 'hours';
                          setData(prev => ({
                            ...prev,
                            fare: { ...prev.fare, extraTimeUnit: nextUnit }
                          }));
                        }}
                        className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-200/70 hover:bg-amber-300 text-slate-900 border border-amber-300 transition-colors cursor-pointer"
                        title="Click to toggle between Mins and Hrs"
                      >
                        {data.fare.extraTimeUnit === 'hours' ? 'Hrs' : 'Mins'}
                      </button>
                    </div>
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={getFareDisplayValue('extraTime')}
                      placeholder="0"
                      onChange={(e) => handleFareInputChange('extraTime', e.target.value)}
                      onWheel={(e) => (e.target as HTMLElement).blur()}
                      className="w-full bg-white border border-slate-200/90 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
                    />
                  </div>

                  {/* Rate / Extra Time (₹) */}
                  <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/70 shadow-2xs">
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Rate / Extra {data.fare.extraTimeUnit === 'hours' ? 'Hr' : 'Min'} (₹)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={getFareDisplayValue('extraTimeRate')}
                      placeholder=""
                      onChange={(e) => handleFareInputChange('extraTimeRate', e.target.value)}
                      onWheel={(e) => (e.target as HTMLElement).blur()}
                      className="w-full bg-white border border-slate-200/90 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
                    />
                  </div>
                </div>
              </section>

              {/* Card 4: Waiting & Travel Extra Charges */}
              <section className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-200/80 space-y-4">
                <div className="border-b border-slate-100 pb-2.5">
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                    Waiting, Toll, Permits & Travel Charges
                  </h3>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
                  {/* Waiting (Min) */}
                  <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/70 shadow-2xs">
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Waiting (Min)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={getFareDisplayValue('waitingMinutes')}
                      placeholder="0"
                      onChange={(e) => handleFareInputChange('waitingMinutes', e.target.value)}
                      onWheel={(e) => (e.target as HTMLElement).blur()}
                      className="w-full bg-white border border-slate-200/90 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
                    />
                  </div>

                  {/* Waiting Rate (₹/min) */}
                  <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/70 shadow-2xs">
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Waiting Rate (₹)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={getFareDisplayValue('waitingRate')}
                      placeholder=""
                      onChange={(e) => handleFareInputChange('waitingRate', e.target.value)}
                      onWheel={(e) => (e.target as HTMLElement).blur()}
                      className="w-full bg-white border border-slate-200/90 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
                    />
                  </div>

                  {/* Toll & Parking */}
                  <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/70 shadow-2xs">
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Toll & Parking (₹)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={getFareDisplayValue('toll')}
                      placeholder="0.00"
                      onChange={(e) => handleFareInputChange('toll', e.target.value)}
                      onWheel={(e) => (e.target as HTMLElement).blur()}
                      className="w-full bg-white border border-slate-200/90 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
                    />
                  </div>

                  {/* Permit Charges */}
                  <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/70 shadow-2xs">
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Permit Charges (₹)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={getFareDisplayValue('permit')}
                      placeholder="0.00"
                      onChange={(e) => handleFareInputChange('permit', e.target.value)}
                      onWheel={(e) => (e.target as HTMLElement).blur()}
                      className="w-full bg-white border border-slate-200/90 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
                    />
                  </div>

                  {/* Driver Bata */}
                  <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/70 shadow-2xs">
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Driver Beta (₹)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={getFareDisplayValue('driverBata')}
                      placeholder="0.00"
                      onChange={(e) => handleFareInputChange('driverBata', e.target.value)}
                      onWheel={(e) => (e.target as HTMLElement).blur()}
                      className="w-full bg-white border border-slate-200/90 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
                    />
                  </div>

                  {/* Peak Charges */}
                  <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/70 shadow-2xs">
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Peak Charges (₹)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={getFareDisplayValue('peakCharge')}
                      placeholder="0.00"
                      onChange={(e) => handleFareInputChange('peakCharge', e.target.value)}
                      onWheel={(e) => (e.target as HTMLElement).blur()}
                      className="w-full bg-white border border-slate-200/90 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
                    />
                  </div>

                  {/* Surcharges */}
                  <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/70 shadow-2xs">
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Surcharges (₹)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={getFareDisplayValue('surcharge')}
                      placeholder="0.00"
                      onChange={(e) => handleFareInputChange('surcharge', e.target.value)}
                      onWheel={(e) => (e.target as HTMLElement).blur()}
                      className="w-full bg-white border border-slate-200/90 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
                    />
                  </div>

                  {/* Day Rent */}
                  <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/70 shadow-2xs">
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Day Rent (₹)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={getFareDisplayValue('dayRent')}
                      placeholder="0.00"
                      onChange={(e) => handleFareInputChange('dayRent', e.target.value)}
                      onWheel={(e) => (e.target as HTMLElement).blur()}
                      className="w-full bg-white border border-slate-200/90 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
                    />
                  </div>

                  {/* Hills Charges */}
                  <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/70 shadow-2xs">
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Hills Charges (₹)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={getFareDisplayValue('hillsCharge')}
                      placeholder="0.00"
                      onChange={(e) => handleFareInputChange('hillsCharge', e.target.value)}
                      onWheel={(e) => (e.target as HTMLElement).blur()}
                      className="w-full bg-white border border-slate-200/90 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
                    />
                  </div>

                  {/* Extra Charges */}
                  <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/70 shadow-2xs">
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Extra Charges (₹)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={getFareDisplayValue('extraCharges')}
                      placeholder="0.00"
                      onChange={(e) => handleFareInputChange('extraCharges', e.target.value)}
                      onWheel={(e) => (e.target as HTMLElement).blur()}
                      className="w-full bg-white border border-slate-200/90 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
                    />
                  </div>
                </div>
              </section>

              {/* Card 5: Tax, Advance & Notes */}
              <section className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-200/80 space-y-4">
                <div className="border-b border-slate-100 pb-2.5">
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                    Tax, Advance Payment & Notes
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  {/* Tax Label */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Tax Label (e.g. GST)
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        value={data.fare.taxLabel || ''}
                        placeholder=""
                        onChange={(e) => updateFare('taxLabel', e.target.value)}
                        className="w-full bg-slate-50/90 hover:bg-slate-100/70 focus:bg-white border border-slate-200/80 focus:border-amber-400 focus:ring-4 focus:ring-amber-400/20 rounded-2xl pl-4 pr-10 py-2.5 text-xs font-bold text-slate-900 outline-none transition-all shadow-2xs"
                      />
                      {data.fare.taxLabel && (
                        <button
                          type="button"
                          onClick={() => updateFare('taxLabel', '')}
                          className="absolute right-2.5 w-6 h-6 rounded-full bg-amber-400 hover:bg-rose-500 text-slate-950 hover:text-white flex items-center justify-center shadow-xs transition-colors cursor-pointer group"
                          title="Click to clear"
                        >
                          <Check size={11} className="stroke-[3] group-hover:hidden" />
                          <X size={12} className="stroke-[3] hidden group-hover:block" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Tax % */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-bold text-slate-700">
                        Tax %
                      </label>
                      {totals.taxAmount > 0 && (
                        <span className="text-[10px] font-mono font-bold text-amber-600">
                          = ₹{totals.taxAmount.toFixed(2)}
                        </span>
                      )}
                    </div>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={getFareDisplayValue('taxPercentage')}
                        placeholder="5"
                        onChange={(e) => handleFareInputChange('taxPercentage', e.target.value)}
                        onWheel={(e) => (e.target as HTMLElement).blur()}
                        className="w-full bg-slate-50/90 hover:bg-slate-100/70 focus:bg-white border border-slate-200/80 focus:border-amber-400 focus:ring-4 focus:ring-amber-400/20 rounded-2xl pl-4 pr-10 py-2.5 text-xs font-mono font-bold text-slate-900 outline-none transition-all shadow-2xs"
                      />
                      {data.fare.taxPercentage > 0 && (
                        <button
                          type="button"
                          onClick={() => clearFareField('taxPercentage')}
                          className="absolute right-2.5 w-6 h-6 rounded-full bg-amber-400 hover:bg-rose-500 text-slate-950 hover:text-white flex items-center justify-center shadow-xs transition-colors cursor-pointer group"
                          title="Click to clear"
                        >
                          <Check size={11} className="stroke-[3] group-hover:hidden" />
                          <X size={12} className="stroke-[3] hidden group-hover:block" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Advance Paid */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Advance Paid (₹)
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={getFareDisplayValue('advancePaid')}
                        placeholder="0.00"
                        onChange={(e) => handleFareInputChange('advancePaid', e.target.value)}
                        onWheel={(e) => (e.target as HTMLElement).blur()}
                        className="w-full bg-slate-50/90 hover:bg-slate-100/70 focus:bg-white border border-slate-200/80 focus:border-amber-400 focus:ring-4 focus:ring-amber-400/20 rounded-2xl pl-4 pr-10 py-2.5 text-xs font-mono font-bold text-slate-900 outline-none transition-all shadow-2xs"
                      />
                      {data.fare.advancePaid > 0 && (
                        <button
                          type="button"
                          onClick={() => clearFareField('advancePaid')}
                          className="absolute right-2.5 w-6 h-6 rounded-full bg-amber-400 hover:bg-rose-500 text-slate-950 hover:text-white flex items-center justify-center shadow-xs transition-colors cursor-pointer group"
                          title="Click to clear"
                        >
                          <Check size={11} className="stroke-[3] group-hover:hidden" />
                          <X size={12} className="stroke-[3] hidden group-hover:block" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Notes / Special Remarks */}
                  <div className="sm:col-span-3">
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Notes & Special Remarks (Printed on Invoice)
                    </label>
                    <textarea
                      value={data.notes || ''}
                      onChange={(e) => setData(prev => ({ ...prev, notes: e.target.value }))}
                      placeholder=""
                      rows={2}
                      className="w-full bg-slate-50/90 hover:bg-slate-100/70 focus:bg-white border border-slate-200/80 focus:border-amber-400 focus:ring-4 focus:ring-amber-400/20 rounded-2xl px-4 py-2.5 text-xs font-medium text-slate-900 outline-none transition-all shadow-2xs resize-y"
                    />
                  </div>
                </div>
              </section>
            </div>
          )
        ) : (
          /* PREVIEW ONLY MODE */
          <div className="space-y-4">
            {/* Render Scaled Preview */}
            <div 
              className="px-2 md:px-4 flex justify-center overflow-hidden bg-[#F8F9FA] py-6 md:py-2 print-container"
              style={{ 
                height: previewScale < 1 && invoiceHeight > 0 ? `${(invoiceHeight * previewScale) + 40}px` : 'auto' 
              }}
            >
              <div 
                className="origin-top transition-transform duration-300"
                style={{ transform: `scale(${previewScale})`, width: '210mm' }}
              >
                {renderInvoiceTemplate()}
              </div>
            </div>
          </div>
        )}

        {/* Clean Responsive Action & Summary Card in Document Flow (Never blocks screen/inputs) */}
        <div className="bg-slate-50 text-slate-900 rounded-2xl p-4 sm:p-5 shadow-xs border border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3.5 mt-8 no-print">
          <div className="flex items-center justify-between sm:justify-start sm:gap-4">
            <div>
              <div className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Grand Total
              </div>
              <div className="text-2xl sm:text-3xl font-black text-slate-950 font-mono tracking-tight mt-0.5">
                ₹{totals.grandTotal.toFixed(2)}
              </div>
            </div>
            {totals.balance !== totals.grandTotal && (
              <span className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-full whitespace-nowrap">
                Due: ₹{totals.balance.toFixed(2)}
              </span>
            )}
          </div>

          {/* Action Buttons - WhatsApp PDF and Download PDF on Preview PDF page */}
          {showPreview ? (
            <div className="grid grid-cols-2 sm:flex sm:items-center gap-2.5">
              <button
                type="button"
                onClick={shareWhatsApp}
                disabled={isGenerating}
                className="h-11 px-4 sm:px-5 bg-[#25D366] hover:bg-[#20bd5a] active:scale-95 text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                title="Share Bill PDF to WhatsApp"
              >
                <Share2 size={16} className="stroke-[2.2]" />
                <span className="whitespace-nowrap">{isGenerating ? "Preparing PDF..." : "WhatsApp PDF"}</span>
              </button>

              <button
                type="button"
                onClick={downloadPDF}
                disabled={isGenerating}
                className="h-11 px-5 bg-amber-400 hover:bg-amber-300 active:scale-95 text-slate-950 font-black text-xs sm:text-sm rounded-xl shadow-xs transition-all flex items-center justify-center cursor-pointer disabled:opacity-50 border border-amber-500/20"
                title="Download 1-Page PDF"
              >
                <span className="whitespace-nowrap">{isGenerating ? "Saving..." : "Download PDF"}</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowPreview(true)}
              className="h-11 px-5 bg-amber-400 hover:bg-amber-300 active:scale-95 text-slate-950 font-black text-xs sm:text-sm rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer border border-amber-500/20"
              title="Preview Generated PDF"
            >
              <Eye size={16} className="stroke-[2.5]" />
              <span>Preview PDF</span>
            </button>
          )}
        </div>
      </main>
      </div>

    </div>
  );
}
