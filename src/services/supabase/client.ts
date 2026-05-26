import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://YOUR_PROJECT_ID.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

const memoryStorage = (() => {
  const store = new Map<string, string>();
  return {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
  };
})();

const webStorage = {
  getItem(key: string) {
    try {
      return typeof window !== "undefined" ? window.localStorage.getItem(key) : memoryStorage.getItem(key);
    } catch {
      return memoryStorage.getItem(key);
    }
  },
  setItem(key: string, value: string) {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(key, value);
        return;
      }
    } catch {
      // fall back to in-memory storage below
    }

    memoryStorage.setItem(key, value);
  },
  removeItem(key: string) {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(key);
        return;
      }
    } catch {
      // fall back to in-memory storage below
    }

    memoryStorage.removeItem(key);
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: webStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    storageKey: "hotel-app-auth",
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});
