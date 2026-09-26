import type { BillItem } from "../types/billing";

export interface ParsedBillResult {
  parsed: Partial<BillItem>;
  detectedFields: string[];
  rawText: string;
  isPackage?: boolean;
}

export interface MultiTripDetectResult {
  trips: Array<{
    title: string;
    tripId: string;
    type: "package" | "ride";
    totalText: string;
    parsedResult: ParsedBillResult;
  }>;
}

/**
 * Extracts 10-digit Indian mobile number from arbitrary string
 */
export function extractPhoneNumber(text: string): string {
  // Check for labelled mobile/phone/contact first
  const labelMatch = text.match(/(?:mobile|phone|ph|contact|whatsapp|cell|tel|customer\s*contact)[:\s\-#]*(\+?91[\s\-]*)?([6-9]\d{9})/i);
  if (labelMatch && labelMatch[2]) {
    return labelMatch[2];
  }

  // Check for standard 10 digit starting with 6-9
  const generalMatch = text.match(/(?:\+?91[\s\-]*)?([6-9]\d{9})\b/);
  if (generalMatch && generalMatch[1]) {
    return generalMatch[1];
  }

  // Fallback: strip non-digits and look for 10 digits
  const digits = text.replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length > 10 && digits.startsWith("91")) {
    const candidate = digits.slice(-10);
    if (/^[6-9]/.test(candidate)) return candidate;
  }
  return "";
}

const MONTH_MAP: Record<string, string> = {
  jan: "01", january: "01",
  feb: "02", february: "02",
  mar: "03", march: "03",
  apr: "04", april: "04",
  may: "05",
  jun: "06", june: "06",
  jul: "07", july: "07",
  aug: "08", august: "08",
  sep: "09", sept: "09", september: "09",
  oct: "10", october: "10",
  nov: "11", november: "11",
  dec: "12", december: "12"
};

/**
 * Parses individual copied booking message, driver trip sheet, SMS, or WhatsApp receipt.
 */
export function parseSingleRideText(text: string): ParsedBillResult {
  const detected: string[] = [];
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  const parsed: Partial<BillItem> = {
    paymentMode: "cash",
    paymentStatus: "paid",
    gstPercent: 0,
    discount: 0,
    waitingHours: 0,
    waitingCharge: 0,
    driverBata: 0,
    tollCharges: 0,
    parkingCharges: 0,
    nightCharges: 0,
    otherCharges: 0,
  };

  // 1. Trip ID / Bill Number / Invoice Number
  const tripIdMatch = text.match(/(?:trip\s*id|trip\s*no|invoice\s*no|invoice\s*#|bill\s*no|booking\s*id)[:\s\-#]*([A-Za-z0-9\-]+)/i);
  if (tripIdMatch && tripIdMatch[1]) {
    parsed.billNumber = tripIdMatch[1].trim();
    detected.push(`Trip #${parsed.billNumber}`);
  }

  // 2. Package Detection
  const isPackage = /TAXI\s*PACKAGE\s*RECEIPT/i.test(text) || 
                    /Package\s*Details/i.test(text) || 
                    /Package\s*Fare/i.test(text) || 
                    /\bPackage[:\s]/i.test(text);

  if (isPackage) {
    parsed.isPackage = true;
    parsed.tripType = "local";
    detected.push("Package Ride");
  }

  // 3. Customer Phone / Mobile
  const phone = extractPhoneNumber(text);
  if (phone) {
    parsed.customerPhone = phone;
    detected.push(`Contact (${phone})`);
  }

  // 4. Customer Name
  const nameLabelMatch = text.match(/(?:customer\s*name|guest|passenger|rider|client)[:\s\-]+([A-Za-z\s\.]+)(?:[\r\n,;]|$)/i);
  if (nameLabelMatch && nameLabelMatch[1].trim()) {
    const rawName = nameLabelMatch[1].trim();
    if (rawName.length > 1 && !/^(mobile|phone|contact|pickup|drop|from|to|km)/i.test(rawName)) {
      parsed.customerName = rawName;
      detected.push(`Customer: ${rawName}`);
    }
  } else {
    // Check lines for Name with phone: "Ramesh 9876543210"
    for (const line of lines) {
      const lineMatch = line.match(/^([A-Za-z\s]{3,25})[\s\-:]+(\+?91[\s\-]*)?[6-9]\d{9}/i);
      if (lineMatch && lineMatch[1]) {
        const potential = lineMatch[1].trim();
        if (!/^(pickup|drop|date|time|trip|vehicle|car|from|to|distance|driver|package|customer\s*contact|customer\s*phone|customer\s*mobile|contact|phone|mobile)/i.test(potential)) {
          parsed.customerName = potential;
          detected.push(`Customer: ${potential}`);
          break;
        }
      }
    }
  }

  // 5. Driver & Vehicle Registration
  // Format: "Driver: DHIWAKAR (TN 66 U 8020)" or "Driver: DHIWAKAR"
  const driverMatch = text.match(/(?:driver|captain|pilot|chauffeur)[:\s\-]+([^\r\n]+)/i);
  if (driverMatch && driverMatch[1].trim()) {
    const rawDriver = driverMatch[1].trim();
    const parenMatch = rawDriver.match(/^([^(]+?)(?:\s*\(([^)]+)\))?$/);
    if (parenMatch) {
      parsed.driverName = parenMatch[1].trim();
      if (parenMatch[2]) {
        const candidateReg = parenMatch[2].trim().toUpperCase().replace(/[-]/g, " ").replace(/\s+/g, " ");
        parsed.vehicleNumber = candidateReg;
        detected.push(`Vehicle: ${candidateReg}`);
      }
    } else {
      parsed.driverName = rawDriver;
    }
    detected.push(`Driver: ${parsed.driverName}`);
  }

  // 6. Vehicle Type & Standalone Registration
  // Format: "Vehicle: Mini Taxi" or "Vehicle: Sedan (TN 38 AB 1234)"
  const vehicleMatch = text.match(/(?:vehicle|car|cab|vehicle\s*type|cab\s*type)[:\s\-]+([^\r\n]+)/i);
  if (vehicleMatch && vehicleMatch[1].trim()) {
    const rawVehicle = vehicleMatch[1].trim();
    const vParen = rawVehicle.match(/^([^(]+?)(?:\s*\(([^)]+)\))?$/);
    if (vParen) {
      parsed.vehicleType = vParen[1].trim();
      if (vParen[2] && !parsed.vehicleNumber) {
        parsed.vehicleNumber = vParen[2].trim().toUpperCase().replace(/[-]/g, " ").replace(/\s+/g, " ");
      }
    } else {
      parsed.vehicleType = rawVehicle;
    }
    detected.push(`Vehicle: ${parsed.vehicleType}`);
  }

  // Standalone Indian vehicle registration number (e.g. TN 66 U 8020, KA 01 AB 1234, DL 3C AA 1111)
  if (!parsed.vehicleNumber) {
    const regMatch = text.match(/\b([A-Z]{2}\s*[-]?\s*\d{1,2}\s*[-]?\s*[A-Z]{1,3}\s*[-]?\s*\d{3,4})\b/i);
    if (regMatch) {
      parsed.vehicleNumber = regMatch[1].trim().toUpperCase().replace(/[-]/g, " ").replace(/\s+/g, " ");
      detected.push(`Vehicle No: ${parsed.vehicleNumber}`);
    }
  }

  // 7. Date Parsing (handles "23 Sept 2026, 05:38 pm", "23/09/2026", "2026-09-23")
  const textDateMatch = text.match(/\b(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember|t)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[,\s]+(\d{4})\b/i);
  if (textDateMatch) {
    const day = textDateMatch[1].padStart(2, "0");
    const mStr = textDateMatch[2].toLowerCase();
    const month = MONTH_MAP[mStr] || "01";
    const year = textDateMatch[3];
    parsed.billDate = `${year}-${month}-${day}`;
    detected.push(`Date: ${day}/${month}/${year}`);
  } else {
    const isoMatch = text.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
    if (isoMatch) {
      parsed.billDate = `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`;
      detected.push(`Date: ${parsed.billDate}`);
    } else {
      const numDateMatch = text.match(/\b(\d{1,2})[-/\.](\d{1,2})[-/\.](\d{2,4})\b/);
      if (numDateMatch) {
        const day = numDateMatch[1].padStart(2, "0");
        const month = numDateMatch[2].padStart(2, "0");
        let year = numDateMatch[3];
        if (year.length === 2) year = `20${year}`;
        parsed.billDate = `${year}-${month}-${day}`;
        detected.push(`Date: ${day}/${month}/${year}`);
      } else {
        const now = new Date();
        const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
        parsed.billDate = ist.toISOString().split("T")[0];
      }
    }
  }

  // 8. Time Parsing (Start Time, End Time, Duration, Bill Time)
  const startTimeMatch = text.match(/(?:start\s*time|pickup\s*time)[:\s\-]+([^\r\n]+)/i);
  if (startTimeMatch) {
    parsed.startTime = startTimeMatch[1].trim();
    detected.push(`Start: ${parsed.startTime}`);
  }

  const endTimeMatch = text.match(/(?:end\s*time|drop\s*time)[:\s\-]+([^\r\n]+)/i);
  if (endTimeMatch) {
    parsed.endTime = endTimeMatch[1].trim();
    detected.push(`End: ${parsed.endTime}`);
  }

  const durationMatch = text.match(/(?:duration|trip\s*duration|trip\s*time)[:\s\-]+(\d{1,2}:\d{2}(?::\d{2})?)/i);
  if (durationMatch) {
    parsed.duration = durationMatch[1].trim();
    detected.push(`Duration: ${parsed.duration}`);
  }

  const billTimeMatch = text.match(/Date:[^\r\n,;]+,\s*(\d{1,2}:\d{2}(?:\s*[AaPp][Mm])?)/i) ||
                        text.match(/\b(\d{1,2}:\d{2}(?:\s*[AaPp][Mm]))\b/i);
  if (billTimeMatch) {
    parsed.billTime = billTimeMatch[1].trim().toUpperCase();
  } else if (parsed.startTime) {
    parsed.billTime = parsed.startTime;
  } else {
    const now = new Date();
    const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    parsed.billTime = ist.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  }

  // 9. Locations: Pickup, Drop, and Route Map URL
  const pickupMatch = text.match(/(?:pickup\s*location|pickup|from|source|start\s*point|origin)[:\s\-]+([^\r\n]+)/i);
  if (pickupMatch && pickupMatch[1].trim()) {
    parsed.pickupLocation = pickupMatch[1].trim();
    detected.push("Pickup Location");
  }

  const dropMatch = text.match(/(?:drop\s*location|drop|to|destination|end\s*point)[:\s\-]+([^\r\n]+)/i);
  if (dropMatch && dropMatch[1].trim()) {
    parsed.dropLocation = dropMatch[1].trim();
    detected.push("Drop Location");
  }

  // Alternative route line: "Town Hall to Saravanampatti"
  if (!parsed.pickupLocation || !parsed.dropLocation) {
    for (const line of lines) {
      const routeMatch = line.match(/^([A-Za-z0-9\s,\.]{3,35})\s+(?:to|TO|-->|->)\s+([A-Za-z0-9\s,\.]{3,35})$/);
      if (routeMatch) {
        if (!parsed.pickupLocation) parsed.pickupLocation = routeMatch[1].trim();
        if (!parsed.dropLocation) parsed.dropLocation = routeMatch[2].trim();
        detected.push("Trip Route");
        break;
      }
    }
  }

  const routeMapMatch = text.match(/(?:route\s*map|route\s*link|route|map)[:\s\-]+(https?:\/\/[^\s\r\n]+)/i);
  if (routeMapMatch) {
    parsed.routeMap = routeMapMatch[1].trim();
    detected.push("Route Map");
  }

  // 10. Distance (KM) - supports 0.00 KM, 0.03 KM, 14 KM, etc.
  const distMatch = text.match(/(?:^|\n)\s*Distance[:\s\-]+(\d+(?:\.\d+)?)\s*(?:kms?|kilometers?)?/i) ||
                    text.match(/(?:distance|trip\s*distance|total\s*km)[:\s\-]+(\d+(?:\.\d+)?)\s*(?:kms?|kilometers?)?/i);
  if (distMatch) {
    const kmVal = parseFloat(distMatch[1]);
    if (!isNaN(kmVal)) {
      parsed.totalKm = kmVal;
      detected.push(`Distance: ${kmVal} KM`);
    }
  }

  // 11. Package Details: Package: 1 Hour / 10 KM, Included KM, Included Time
  const pkgHeaderMatch = text.match(/Package[:\s\-]+(\d+(?:\.\d+)?)\s*(?:hour|hr|hrs)?\s*(?:\/|\&|\-)\s*(\d+(?:\.\d+)?)\s*kms?/i);
  if (pkgHeaderMatch) {
    parsed.packageHours = parseFloat(pkgHeaderMatch[1]);
    parsed.packageKm = parseFloat(pkgHeaderMatch[2]);
    detected.push(`Package: ${parsed.packageHours}H / ${parsed.packageKm}KM`);
  }

  const incKmMatch = text.match(/Included\s*KM[:\s\-]+(\d+(?:\.\d+)?)\s*kms?/i);
  if (incKmMatch) {
    parsed.packageKm = parseFloat(incKmMatch[1]);
  }

  const incTimeMatch = text.match(/Included\s*Time[:\s\-]+(\d+(?:\.\d+)?)\s*(?:mins?|minutes?|hours?|hrs?)/i);
  if (incTimeMatch) {
    const timeVal = parseFloat(incTimeMatch[1]);
    if (/hour|hr/i.test(incTimeMatch[0])) {
      parsed.packageHours = timeVal;
    } else {
      parsed.packageHours = timeVal / 60;
    }
  }

  // 12. Fares Breakdown (Base Fare / Package Fare, Distance Fare, Waiting Fare, Extra KM, Extra Time)
  // Package Fare: INR 375.00
  const pkgFareMatch = text.match(/Package\s*Fare[:\s\-]+(?:inr|rs\.?|₹)?\s*(\d+(?:\.\d+)?)/i);
  if (pkgFareMatch) {
    parsed.baseFare = parseFloat(pkgFareMatch[1]);
    detected.push(`Package Fare: ₹${parsed.baseFare}`);
  }

  // Base Fare: INR 80.00
  const baseFareMatch = text.match(/(?:base\s*fare|min\s*fare|minimum\s*fare|starting\s*fare)[:\s\-]+(?:inr|rs\.?|₹)?\s*(\d+(?:\.\d+)?)/i);
  if (baseFareMatch && !parsed.baseFare) {
    parsed.baseFare = parseFloat(baseFareMatch[1]);
    detected.push(`Base Fare: ₹${parsed.baseFare}`);
  }

  // Distance Fare: INR 0.73
  const distFareMatch = text.match(/(?:distance\s*fare|km\s*fare)[:\s\-]+(?:inr|rs\.?|₹)?\s*(\d+(?:\.\d+)?)/i);
  if (distFareMatch) {
    parsed.distanceFare = parseFloat(distFareMatch[1]);
    parsed.kmFare = parsed.distanceFare;
    detected.push(`Distance Fare: ₹${parsed.distanceFare}`);
  }

  // Waiting Fare: INR 1.15 (e.g. Waiting Fare: INR 1.15 or (10 Mins @ ₹1.5/Min))
  const waitFareMatch = text.match(/(?:waiting\s*fare|waiting\s*charge|wait\s*fare|wait\s*charge)[:\s\-]+(?:inr|rs\.?|₹)?\s*(\d+(?:\.\d+)?)(?:\s*\(([^)]+)\))?/i);
  if (waitFareMatch) {
    const wFare = parseFloat(waitFareMatch[1]);
    parsed.waitingFare = wFare;
    parsed.waitingCharge = wFare;
    detected.push(`Waiting Fare: ₹${wFare}`);
    if (waitFareMatch[2]) {
      const waitDetails = waitFareMatch[2];
      const minM = waitDetails.match(/(\d+(?:\.\d+)?)\s*(?:mins?|minutes?)/i);
      const rateM = waitDetails.match(/@\s*(?:rs\.?|₹|inr)?\s*(\d+(?:\.\d+)?)\s*\/\s*(?:min|minute)/i);
      if (minM) parsed.waitingMinutes = parseFloat(minM[1]);
      if (rateM) parsed.waitingRate = parseFloat(rateM[1]);
    }
  }

  // Minimum Fare Adjustment: INR 116.86
  const minAdjustMatch = text.match(/(?:minimum\s*fare\s*adjustment|min\s*fare\s*adjustment|fare\s*adjustment)[:\s\-]+(?:inr|rs\.?|₹)?\s*(\d+(?:\.\d+)?)/i);
  if (minAdjustMatch) {
    parsed.minFareAdjustment = parseFloat(minAdjustMatch[1]);
    detected.push(`Min Fare Adjustment: ₹${parsed.minFareAdjustment}`);
  }

  // Extra KM Fare: INR 200.00 (10.0 KM @ ₹20.0/KM)
  const extraKmMatch = text.match(/Extra\s*KM\s*Fare[:\s\-]+(?:inr|rs\.?|₹)?\s*(\d+(?:\.\d+)?)(?:\s*\(([^)]+)\))?/i);
  if (extraKmMatch) {
    parsed.extraKmsFare = parseFloat(extraKmMatch[1]);
    if (extraKmMatch[2]) {
      const details = extraKmMatch[2];
      const kmM = details.match(/(\d+(?:\.\d+)?)\s*KM/i);
      const rateM = details.match(/@\s*(?:rs\.?|₹|inr)?\s*(\d+(?:\.\d+)?)\s*\/\s*KM/i);
      if (kmM) parsed.extraKms = parseFloat(kmM[1]);
      if (rateM) parsed.extraKmsRate = parseFloat(rateM[1]);
    }
    detected.push(`Extra KM Fare: ₹${parsed.extraKmsFare}`);
  }

  // Extra Time Fare: INR 124.8 (60.0 Mins @ ₹2.08/Min)
  const extraTimeMatch = text.match(/Extra\s*Time\s*Fare[:\s\-]+(?:inr|rs\.?|₹)?\s*(\d+(?:\.\d+)?)(?:\s*\(([^)]+)\))?/i);
  if (extraTimeMatch) {
    parsed.extraTimeFare = parseFloat(extraTimeMatch[1]);
    if (extraTimeMatch[2]) {
      const details = extraTimeMatch[2];
      const minM = details.match(/(\d+(?:\.\d+)?)\s*(?:mins?|minutes?)/i);
      const hrM = details.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)/i);
      const rateM = details.match(/@\s*(?:rs\.?|₹|inr)?\s*(\d+(?:\.\d+)?)\s*\/\s*(?:min|minute|hr|hour)/i);
      if (minM) {
        parsed.extraTime = parseFloat(minM[1]);
        parsed.extraTimeUnit = 'mins';
      } else if (hrM) {
        parsed.extraTime = parseFloat(hrM[1]);
        parsed.extraTimeUnit = 'hours';
      }
      if (rateM) parsed.extraTimeRate = parseFloat(rateM[1]);
    }
    detected.push(`Extra Time Fare: ₹${parsed.extraTimeFare}`);
  }

  // Rate per KM (only if not a package ride, or explicit regular rate line)
  if (!isPackage) {
    const rateMatch = text.match(/(?:^|\n)\s*(?:rate|per\s*km|perkm|\/km|@)\s*[:=]?\s*(?:inr|rs\.?|₹)?\s*(\d+(?:\.\d+)?)/i) ||
                      text.match(/(\d+(?:\.\d+)?)\s*(?:rs|inr|₹)?\s*\/\s*km/i);
    if (rateMatch && rateMatch[1]) {
      const r = parseFloat(rateMatch[1]);
      if (!isNaN(r) && r > 0) {
        parsed.ratePerKm = r;
        detected.push(`Rate: ₹${r}/KM`);
      }
    }
  }

  // Auto-calculate ratePerKm from distanceFare and totalKm if distance > 0 (for non-package trips)
  if (!isPackage && !parsed.ratePerKm && parsed.distanceFare !== undefined && parsed.totalKm !== undefined && parsed.totalKm > 0) {
    parsed.ratePerKm = Number((parsed.distanceFare / parsed.totalKm).toFixed(2));
  }

  // Driver Bata / Allowance
  const bataMatch = text.match(/(?:driver\s*bata|bata|driver\s*allowance|da)[:\s\-]+(?:inr|rs\.?|₹)?\s*(\d+(?:\.\d+)?)/i);
  if (bataMatch && bataMatch[1]) {
    parsed.driverBata = parseFloat(bataMatch[1]);
    detected.push(`Driver Bata: ₹${parsed.driverBata}`);
  }

  // Toll Charges
  const tollMatch = text.match(/(?:toll|tolls|tollgate|fastag)[:\s\-]+(?:inr|rs\.?|₹)?\s*(\d+(?:\.\d+)?)/i);
  if (tollMatch && tollMatch[1]) {
    parsed.tollCharges = parseFloat(tollMatch[1]);
    detected.push(`Toll: ₹${parsed.tollCharges}`);
  }

  // Parking Charges
  const parkingMatch = text.match(/(?:parking|parking\s*fee|airport\s*entry)[:\s\-]+(?:inr|rs\.?|₹)?\s*(\d+(?:\.\d+)?)/i);
  if (parkingMatch && parkingMatch[1]) {
    parsed.parkingCharges = parseFloat(parkingMatch[1]);
    detected.push(`Parking: ₹${parsed.parkingCharges}`);
  }

  // Permit Charges
  const permitMatch = text.match(/(?:permit|permit\s*charges?|interstate\s*permit|state\s*permit|state\s*tax)[:\s\-]+(?:inr|rs\.?|₹)?\s*(\d+(?:\.\d+)?)/i);
  if (permitMatch && permitMatch[1]) {
    (parsed as any).permit = parseFloat(permitMatch[1]);
    detected.push(`Permit: ₹${(parsed as any).permit}`);
  }

  // Other / Extra Charges
  const otherChargesMatch = text.match(/(?:other\s*charges?|extra\s*charges?|misc\s*charges?|miscellaneous)[:\s\-]+(?:inr|rs\.?|₹)?\s*(\d+(?:\.\d+)?)/i);
  if (otherChargesMatch && otherChargesMatch[1]) {
    parsed.otherCharges = parseFloat(otherChargesMatch[1]);
    detected.push(`Other Charges: ₹${parsed.otherCharges}`);
  }

  // Night Charges
  const nightMatch = text.match(/(?:night\s*charges?|night\s*fee|late\s*night)[:\s\-]+(?:inr|rs\.?|₹)?\s*(\d+(?:\.\d+)?)/i);
  if (nightMatch && nightMatch[1]) {
    parsed.nightCharges = parseFloat(nightMatch[1]);
    detected.push(`Night Charge: ₹${parsed.nightCharges}`);
  }

  // 13. Total Payable (supports "Total Payable: INR 375.00", "Total Payable: INR 81.88", etc.)
  const totalMatch = text.match(/(?:total\s*payable|total\s*fare|total\s*amount|grand\s*total|net\s*amount|final\s*amount|bill\s*amount|amount|total)[:\s\-]+(?:inr|rs\.?|₹)?\s*(\d+(?:\.\d+)?)/i);
  if (totalMatch && totalMatch[1]) {
    parsed.totalAmount = parseFloat(totalMatch[1]);
    detected.push(`Total Payable: ₹${parsed.totalAmount}`);
  }

  // 14. Trip Type fallback
  if (!parsed.tripType) {
    if (/outstation/i.test(text)) {
      parsed.tripType = "outstation";
      detected.push("Outstation Trip");
    } else if (/round\s*trip/i.test(text)) {
      parsed.tripType = "round_trip";
      detected.push("Round Trip");
    } else if (/airport/i.test(text)) {
      parsed.tripType = "airport";
      detected.push("Airport Ride");
    } else if (/local|hourly|package/i.test(text)) {
      parsed.tripType = "local";
      detected.push("Local Trip");
    } else {
      parsed.tripType = "one_way";
    }
  }

  // Compute calculated amounts if rate and KM are present
  const km = parsed.totalKm || 0;
  const rate = parsed.ratePerKm || 0;
  const kmFare = !isPackage
    ? (parsed.distanceFare !== undefined ? parsed.distanceFare : (km * rate))
    : 0;
  parsed.kmFare = kmFare;

  const base = parsed.baseFare || 0;
  const extraKms = parsed.extraKmsFare || 0;
  const extraTime = parsed.extraTimeFare || 0;
  const bata = parsed.driverBata || 0;
  const tolls = parsed.tollCharges || 0;
  const parking = parsed.parkingCharges || 0;
  const wait = parsed.waitingFare || parsed.waitingCharge || 0;
  const night = parsed.nightCharges || 0;
  const other = parsed.otherCharges || 0;

  const minAdjust = !isPackage ? (parsed.minFareAdjustment || 0) : 0;
  const calculatedSubtotal = base + kmFare + extraKms + extraTime + minAdjust + bata + tolls + parking + wait + night + other;
  parsed.subtotal = calculatedSubtotal;

  if (parsed.totalAmount === undefined || parsed.totalAmount === 0) {
    parsed.totalAmount = calculatedSubtotal;
  }

  // Payment Mode detection
  if (/upi|gpay|google\s*pay|phonepe|paytm/i.test(text)) {
    parsed.paymentMode = "upi";
    detected.push("UPI");
  } else if (/card|pos|credit|debit/i.test(text)) {
    parsed.paymentMode = "card";
    detected.push("Card");
  } else if (/pending|unpaid|due/i.test(text)) {
    parsed.paymentMode = "pending";
    parsed.paymentStatus = "pending";
    detected.push("Pending");
  } else {
    parsed.paymentMode = "cash";
  }

  return {
    parsed,
    detectedFields: detected,
    rawText: text,
    isPackage,
  };
}

/**
 * Splits raw pasted text if the user pasted multiple receipts simultaneously (e.g. TAXI PACKAGE RECEIPT + TAXI RIDE RECEIPT)
 */
export function splitMultipleReceipts(rawText: string): string[] {
  const trimmed = rawText.trim();
  // Split on "TAXI PACKAGE RECEIPT" or "TAXI RIDE RECEIPT"
  const chunks = trimmed.split(/(?=(?:TAXI\s+(?:PACKAGE|RIDE)\s+RECEIPT))/i).map(s => s.trim()).filter(Boolean);
  if (chunks.length > 1) {
    return chunks;
  }

  // Split on multiple "Trip Id:"
  const tripChunks = trimmed.split(/(?=(?:Trip\s*Id:\s*\d+))/i).map(s => s.trim()).filter(Boolean);
  if (tripChunks.length > 1) {
    return tripChunks;
  }

  return [trimmed];
}

/**
 * Parses copied ride or package text into structured bill data
 */
export function parseCopiedRideText(text: string): ParsedBillResult {
  return parseSingleRideText(text.trim());
}

/**
 * Parses all trips found in the text for multi-trip switcher
 */
export function parseAllTripsInText(text: string): MultiTripDetectResult {
  const chunks = splitMultipleReceipts(text);
  const trips = chunks.map((chunk, idx) => {
    const res = parseSingleRideText(chunk);
    const tripId = res.parsed.billNumber || `Trip-${idx + 1}`;
    const isPkg = res.isPackage || false;
    const total = res.parsed.totalAmount !== undefined ? `₹${res.parsed.totalAmount.toFixed(2)}` : "";
    const title = `${isPkg ? "Package" : "Ride"} #${tripId}${total ? ` (${total})` : ""}`;

    return {
      title,
      tripId,
      type: isPkg ? ("package" as const) : ("ride" as const),
      totalText: total,
      parsedResult: res
    };
  });

  return { trips };
}
