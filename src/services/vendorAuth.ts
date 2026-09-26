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

    // Single-device enforcement: Update activeDeviceId to this device in backend
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
  reason?: "DEVICE_OVERWRITTEN" | "NOT_FOUND" | "NETWORK_OFFLINE";
  message?: string;
}

/**
 * Daily 1-time backend check:
 * - Checks if session has ALREADY been validated today (`lastCheckedDate === today`).
 * - If YES: Returns immediately with 0 READ/WRITE calls!
 * - If NO: Performs exactly 1 check to verify if another device took over the account.
 */
export const verifyDailySession = async (currentSession: VendorSession): Promise<VerificationResult> => {
  const today = getTodayDateString();

  // If already checked today, SKIP read/write completely!
  if (currentSession.lastCheckedDate === today) {
    return { valid: true };
  }

  const firestoreDb = getFirebaseDb();

  if (firestoreDb && isFirebaseConfigured()) {
    try {
      const vendorDocRef = doc(firestoreDb, "vendors", currentSession.vendorId);
      const snapshot = await getDoc(vendorDocRef);

      if (!snapshot.exists()) {
        clearSession();
        return { valid: false, reason: "NOT_FOUND", message: "Vendor account was not found. Please contact administrator." };
      }

      const data = snapshot.data() as VendorRecord;
      // Single-device check: Has another device logged into this vendor account?
      if (data.activeDeviceId && data.activeDeviceId !== currentSession.deviceId) {
        clearSession();
        return {
          valid: false,
          reason: "DEVICE_OVERWRITTEN",
          message: "Account was logged in on another device. Only 1 device is allowed at a time."
        };
      }

      // Valid: Update last checked date in local session (0 more reads for the rest of today)
      currentSession.lastCheckedDate = today;
      saveSession(currentSession);
      return { valid: true };
    } catch {
      // Offline fallback: allow session to continue without logging out
      return { valid: true };
    }
  }

  currentSession.lastCheckedDate = today;
  saveSession(currentSession);
  return { valid: true };
};
