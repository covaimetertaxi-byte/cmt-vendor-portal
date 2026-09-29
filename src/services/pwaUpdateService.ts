// PWA Update Management Service
// Detects genuine code updates and coordinates in-app updates cleanly without continuous popups or demo spam

type UpdateListener = (hasUpdate: boolean, details?: { version?: string }) => void;

class PWAUpdateService {
  private registration: ServiceWorkerRegistration | null = null;
  private hasUpdate = false;
  private hasReloaded = false;
  private latestDetectedVersion: string | null = null;
  private listeners: Set<UpdateListener> = new Set();
  private checkIntervalId: number | null = null;
  private initialVersion: string | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      this.init();
    }
  }

  private async init() {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    // Retrieve initial version from server
    this.fetchCurrentVersion().then((v) => {
      this.initialVersion = v;
      if (v) {
        // Set current installed version if not already stored
        const stored = localStorage.getItem("cmt_last_applied_version");
        if (!stored) {
          localStorage.setItem("cmt_last_applied_version", v);
        }
      }
    });

    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        this.handleRegistration(reg);
      } else {
        const newReg = await navigator.serviceWorker.register("/sw.js");
        this.handleRegistration(newReg);
      }

      // Check on network restore
      window.addEventListener("online", () => {
        this.checkForUpdate(false);
      });

      // Check controller changes
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (!this.hasReloaded) {
          this.hasReloaded = true;
          window.location.reload();
        }
      });
    } catch (err) {
      console.warn("PWA Service Worker notice: ", err);
    }
  }

  private handleRegistration(reg: ServiceWorkerRegistration) {
    this.registration = reg;

    // Listen only for legitimate new worker being installed while app is active
    reg.addEventListener("updatefound", () => {
      const installingWorker = reg.installing;
      if (!installingWorker) return;

      installingWorker.addEventListener("statechange", () => {
        if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
          // Genuine new worker installed while user was using an older version
          this.notifyUpdateAvailable();
        }
      });
    });
  }

  private notifyUpdateAvailable(version?: string) {
    // If update was just applied in this session, do not show continuously!
    if (typeof window !== "undefined") {
      if (sessionStorage.getItem("cmt_update_just_applied") === "true") {
        return;
      }
      const appliedVersion = localStorage.getItem("cmt_last_applied_version");
      if (version && appliedVersion && appliedVersion === version) {
        return;
      }
    }

    this.latestDetectedVersion = version || this.latestDetectedVersion || null;
    this.hasUpdate = true;
    this.listeners.forEach((listener) => {
      try {
        listener(true, { version: this.latestDetectedVersion || undefined });
      } catch (e) {
        console.error("Error in PWA update listener: ", e);
      }
    });
  }

  private async fetchCurrentVersion(): Promise<string | null> {
    try {
      const res = await fetch(`/version.json?_t=${Date.now()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" }
      });
      if (res.ok) {
        const data = await res.json();
        return data.version || data.buildTime || null;
      }
    } catch {
      // offline
    }
    return null;
  }

  /**
   * Checks for updates.
   * forceManual: set to true when user explicitly taps "Check for App Updates" button in Settings.
   */
  public async checkForUpdate(forceManual = false): Promise<boolean> {
    if (!navigator.onLine) {
      return false;
    }

    try {
      // If user recently clicked "Update Now", do not nag them again
      if (sessionStorage.getItem("cmt_update_just_applied") === "true" && !forceManual) {
        return false;
      }

      const remoteVersion = await this.fetchCurrentVersion();
      const lastApplied = localStorage.getItem("cmt_last_applied_version");

      if (remoteVersion && lastApplied && remoteVersion !== lastApplied) {
        this.notifyUpdateAvailable(remoteVersion);
        return true;
      }

      if (this.registration) {
        await this.registration.update();
        if (this.registration.waiting && forceManual) {
          this.notifyUpdateAvailable(remoteVersion || undefined);
          return true;
        }
      }
    } catch (err) {
      console.warn("Check for updates error: ", err);
    }

    return this.hasUpdate;
  }

  /**
   * Applies the update quickly, marks it as applied, hides UI, and immediately reloads.
   */
  public async applyUpdate(): Promise<void> {
    if (this.hasReloaded) return;

    // Immediately mark as applied so it hides and never shows continuously
    try {
      sessionStorage.setItem("cmt_update_just_applied", "true");
      if (this.latestDetectedVersion) {
        localStorage.setItem("cmt_last_applied_version", this.latestDetectedVersion);
      } else {
        localStorage.setItem("cmt_last_applied_version", Date.now().toString());
      }
    } catch {}

    // Immediately notify listeners that update dialog is dismissed/hidden
    this.hasUpdate = false;
    this.listeners.forEach((listener) => {
      try {
        listener(false);
      } catch {}
    });

    try {
      if (this.registration?.waiting) {
        this.registration.waiting.postMessage({ type: "SKIP_WAITING" });
      }

      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          if (reg.waiting) {
            reg.waiting.postMessage({ type: "SKIP_WAITING" });
          }
        }
      }

      if ("caches" in window) {
        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.map((key) => caches.delete(key)));
      }
    } catch (err) {
      console.warn("Error during update application: ", err);
    }

    // Quick reload
    setTimeout(() => {
      if (!this.hasReloaded) {
        this.hasReloaded = true;
        window.location.reload();
      }
    }, 150);
  }

  /**
   * Dismiss the update banner/modal
   */
  public dismissUpdate() {
    this.hasUpdate = false;
    this.listeners.forEach((listener) => listener(false));
  }

  /**
   * Subscribe to update availability events
   */
  public subscribe(listener: UpdateListener): () => void {
    this.listeners.add(listener);
    if (this.hasUpdate) {
      listener(true);
    }
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getIsUpdateAvailable(): boolean {
    return this.hasUpdate;
  }
}

export const pwaUpdateService = new PWAUpdateService();
