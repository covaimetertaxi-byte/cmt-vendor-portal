import type { CompanyProfile } from "../types/billing";
import { DEFAULT_COMPANY_PROFILE } from "../types/billing";

const STORAGE_KEY_COMPANY = "covai_meter_taxi_company_profile";
const STORAGE_KEY_COUNTER = "covai_meter_taxi_bill_counter";

export function getStoredCompanyProfile(): CompanyProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_COMPANY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Only discard if it's the old hardcoded mock data
      if (parsed.name === "TRUSTY YELLOW CABS" && parsed.phone === "+91 8870088020") {
        return DEFAULT_COMPANY_PROFILE;
      }
      return { ...DEFAULT_COMPANY_PROFILE, ...parsed };
    }
  } catch (err) {
    console.error("Failed to load company profile from localStorage", err);
  }
  return DEFAULT_COMPANY_PROFILE;
}

export function saveStoredCompanyProfile(profile: CompanyProfile): void {
  try {
    localStorage.setItem(STORAGE_KEY_COMPANY, JSON.stringify(profile));
  } catch (err) {
    console.error("Failed to save company profile to localStorage", err);
  }
}

export function generateNextBillNumber(): string {
  try {
    const current = parseInt(localStorage.getItem(STORAGE_KEY_COUNTER) || "6752", 10);
    const next = current + 1;
    localStorage.setItem(STORAGE_KEY_COUNTER, next.toString());
    return `2800${next}`;
  } catch {
    const random = Math.floor(1000 + Math.random() * 9000);
    return `2800${random}`;
  }
}
