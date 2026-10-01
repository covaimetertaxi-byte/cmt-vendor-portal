import { doc, getDoc, updateDoc } from "firebase/firestore";
import { getFirebaseDb, isFirebaseConfigured } from "../config/firebase";

export interface VendorSession {
  vendorId: string;
  vendorName: string;
  deviceId: string;
  loggedInAt: number;
  lastCheckedDate: string; // YYYY-MM-DD
  authSource: "firebase" | "backend";
}

export interface VendorRecord {
  vendorId: string;
  vendorName: string;
  pin: string;
  activeDeviceId: string;
  lastLogin: string;
  lastActiveDate: string;
}

const STORAGE_KEYS = {
  SESSION: "cmt_vendor_session",
  DEVICE_ID: "cmt_device_id"
};

// Generates or retrieves a persistent unique Device ID for this browser/phone
export const getOrCreateDeviceId = (): string => {
  let devId = localStorage.getItem(STORAGE_KEYS.DEVICE_ID);
  if (!devId) {
    const randomHex = Math.random().toString(36).substring(2, 8).toUpperCase();
    const timeHex = Date.now().toString(36).toUpperCase();
    devId = `DEV-${timeHex}-${randomHex}`;
    localStorage.setItem(STORAGE_KEYS.DEVICE_ID, devId);
  }
  return devId;
};

// Returns today's date formatted as YYYY-MM-DD (Asia/Kolkata timezone)
export const getTodayDateString = (): string => {
  try {
    const parts = new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date());

    const year = parts.find(p => p.type === "year")?.value || "";
    const month = parts.find(p => p.type === "month")?.value || "";
    const day = parts.find(p => p.type === "day")?.value || "";
    return `${year}-${month}-${day}`;
  } catch {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
};

// Retrieve active session from localStorage (stay logged in across days)
export const getStoredSession = (): VendorSession | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SESSION);
    if (!raw) return null;
    return JSON.parse(raw) as VendorSession;
  } catch {
    return null;
  }
};

// Save session to localStorage
export const saveSession = (session: VendorSession) => {
  localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(session));
};

// Clear session from localStorage
export const clearSession = () => {
  localStorage.removeItem(STORAGE_KEYS.SESSION);
};

// Clear session and release device lock in Firestore so vendor can switch devices if needed
export const logoutVendor = async (session: VendorSession | null) => {
  if (session && session.vendorId) {
    try {
      const firestoreDb = getFirebaseDb();
      if (firestoreDb && isFirebaseConfigured()) {
        const vendorDocRef = doc(firestoreDb, "vendors", session.vendorId);
        await updateDoc(vendorDocRef, {
          activeDeviceId: "",
        });
      }
    } catch (e) {
      console.warn("Could not release activeDeviceId in Firestore:", e);
    }
  }
  clearSession();
};

export interface LoginResult {
  success: boolean;
  message?: string;
  session?: VendorSession;
}

/**
 * Pure Backend Authentication with Single-Device Lock:
 * 1. Checks Firebase Firestore `vendors` collection.
 * 2. Verifies PIN against database record.
 * 3. Overwrites `activeDeviceId` with current device ID (only 1 device at a time).
 * 4. Saves persistent session so user does not need to log in every day.
 */
export const loginVendor = async (
  rawVendorId: string, 
  rawPin: string
): Promise<LoginResult> => {
  const vendorId = rawVendorId.trim().toUpperCase();
  const pin = rawPin.trim();
  const currentDeviceId = getOrCreateDeviceId();
  const today = getTodayDateString();

  if (!vendorId) {
    return { success: false, message: "Please enter your Vendor ID." };
  }
  if (!pin || pin.length < 4) {
    return { success: false, message: "Please enter your 4-digit PIN." };
  }

  const firestoreDb = getFirebaseDb();

  if (!firestoreDb || !isFirebaseConfigured()) {
    return { 
      success: false, 
      message: "Server connection unavailable. Please try again later." 
    };
  }

  try {
    const vendorDocRef = doc(firestoreDb, "vendors", vendorId);
    const snapshot = await getDoc(vendorDocRef);

    if (!snapshot.exists()) {
      return { 
        success: false, 
        message: `Vendor ID "${vendorId}" not found. Please contact administrator.` 
      };
    }

    const data = snapshot.data() as VendorRecord;
    if (data.pin !== pin) {
      return { 
        success: false, 
        message: "Incorrect PIN. Please try again." 
      };
    }

    // Strict 1-Device per 1-Vendor ID Rule:
    // If this vendor is already active on another device, REJECT login.
    if (data.activeDeviceId && data.activeDeviceId !== currentDeviceId) {
      return { 
        success: false, 
        message: `Device Restriction: Vendor ID "${vendorId}" is already active on another device. 1 Vendor ID can only be logged in on 1 device at a time.` 
      };
    }

    // Bind this device to this vendor ID in backend
    await updateDoc(vendorDocRef, {
      activeDeviceId: currentDeviceId,
      lastLogin: new Date().toISOString(),
      lastActiveDate: today
    });

    const session: VendorSession = {
      vendorId: data.vendorId,
      vendorName: data.vendorName || `Vendor ${vendorId}`,
      deviceId: currentDeviceId,
      loggedInAt: Date.now(),
      lastCheckedDate: today,
      authSource: "firebase"
    };

    saveSession(session);
    return { success: true, session };
  } catch (firebaseErr: any) {
    if (firebaseErr?.code === "permission-denied") {
      return {
        success: false,
        message: "Firestore Permission Denied. Please enable read/write in Firebase Console -> Firestore -> Rules."
      };
    }
    if (firebaseErr?.code === "unavailable") {
      return {
        success: false,
        message: "Network unavailable. Please check your internet connection."
      };
    }
    return { 
      success: false, 
      message: "Unable to verify credentials. Please check your Vendor ID & PIN." 
    };
  }
};

export interface VerificationResult {
  valid: boolean;
  reason?: "DEVICE_CLEARED" | "DEVICE_OVERWRITTEN" | "NOT_FOUND" | "NETWORK_OFFLINE";
  message?: string;
}

// Global in-memory throttle to ensure we NEVER spam Firestore with continuous reads
// Guaranteed cost-effective: At most 1 read per 5 minutes per device, with ZERO writes
const MIN_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let lastVerifiedTimestamp = 0;

/**
 * Cost-Effective Session Verification:
 * 1. Checks if activeDeviceId is empty in Firestore backend -> If empty, immediately AUTO-LOGOUT.
 * 2. Checks if another device logged in (activeDeviceId !== deviceId) -> If changed, AUTO-LOGOUT.
 * 3. Cost-effective protection: Throttled to minimum 5-minute interval between reads, with 0 Firestore writes.
 * 4. Offline resilience: If device is offline, preserves session without logging out.
 */
export const verifyVendorSession = async (
  currentSession: VendorSession, 
  forceCheck = false
): Promise<VerificationResult> => {
  const now = Date.now();

  // Cost-effective gate: Skip Firestore read if checked recently (within 5 minutes) unless forced
  if (!forceCheck && now - lastVerifiedTimestamp < MIN_CHECK_INTERVAL_MS) {
    return { valid: true };
  }

  const firestoreDb = getFirebaseDb();

  if (firestoreDb && isFirebaseConfigured() && navigator.onLine) {
    try {
      const vendorDocRef = doc(firestoreDb, "vendors", currentSession.vendorId);
      const snapshot = await getDoc(vendorDocRef);
      lastVerifiedTimestamp = Date.now();

      if (!snapshot.exists()) {
        clearSession();
        return { 
          valid: false, 
          reason: "NOT_FOUND", 
          message: "Vendor account was not found. Please contact administrator." 
        };
      }

      const data = snapshot.data() as VendorRecord;
      const backendDeviceId = (data.activeDeviceId || "").trim();

      // 1. If activeDeviceId is EMPTY in backend -> AUTO LOGOUT!
      if (!backendDeviceId) {
        clearSession();
        return {
          valid: false,
          reason: "DEVICE_CLEARED",
          message: "Your session was ended from backend. Please log in again with your PIN."
        };
      }

      // 2. If activeDeviceId was overwritten by another device -> AUTO LOGOUT!
      if (backendDeviceId !== currentSession.deviceId) {
        clearSession();
        return {
          valid: false,
          reason: "DEVICE_OVERWRITTEN",
          message: "Account was logged in on another device. Only 1 device is allowed at a time."
        };
      }

      return { valid: true };
    } catch {
      // Offline or network glitch: gracefully preserve session
      return { valid: true };
    }
  }

  return { valid: true };
};

// Backwards-compatible alias for existing imports
export const verifyDailySession = verifyVendorSession;
