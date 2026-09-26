export interface CompanyProfile {
  name: string;
  logoUrl: string; // Base64 data URL or empty
  address: string;
  phone: string;
  email: string;
  gstin: string; // GST Number (optional)
  website?: string;
  taxiNumber: string; // Default vehicle registration
  driverName: string; // Default driver name
  footerNote: string; // Terms or thank you message
}

export interface BillItem {
  id: string;
  billNumber: string;
  billDate: string; // YYYY-MM-DD
  billTime: string; // HH:MM
  customerName: string;
  customerPhone: string;
  pickupLocation: string;
  dropLocation: string;
  tripType: "one_way" | "round_trip" | "local" | "outstation" | "airport";
  vehicleType: string;
  vehicleNumber: string;
  driverName: string;
  totalKm: number;
  ratePerKm: number;
  baseFare: number;
  kmFare: number;
  distanceFare?: number;
  waitingHours: number;
  waitingCharge: number;
  waitingFare?: number;
  waitingMinutes?: number;
  waitingRate?: number;
  minFareAdjustment?: number;
  driverBata: number;
  tollCharges: number;
  parkingCharges: number;
  nightCharges: number;
  otherCharges: number;
  discount: number;
  gstPercent: number; // e.g. 0 or 5 or 12
  gstAmount: number;
  subtotal: number;
  totalAmount: number;
  paymentMode: "cash" | "upi" | "card" | "pending";
  paymentStatus: "paid" | "pending";
  duration?: string;
  startTime?: string;
  endTime?: string;
  tripEndTime?: string;
  routeMap?: string;
  isPackage?: boolean;
  packageHours?: number;
  packageKm?: number;
  extraKms?: number;
  extraKmsRate?: number;
  extraKmsFare?: number;
  extraTime?: number;
  extraTimeRate?: number;
  extraTimeFare?: number;
  extraTimeUnit?: 'mins' | 'hours';
  notes?: string;
  rawPastedText?: string;
  createdAt: string;
}

export const DEFAULT_COMPANY_PROFILE: CompanyProfile = {
  name: "",
  logoUrl: "",
  address: "",
  phone: "",
  email: "",
  website: "",
  gstin: "",
  taxiNumber: "",
  driverName: "",
  footerNote: "",
};

export const DEFAULT_CMT_LOGO = "";