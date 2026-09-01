import { getSessionToken } from "./authService";

// Lightweight "who is online" heartbeat. While the app is open and a user is
// signed in, we periodically tell the backend the session is still active so
// the admin dashboard can list currently-online users. All calls are
// best-effort and never block the UI.

const PING_INTERVAL_MS = 45_000;

let timer: ReturnType<typeof setInterval> | null = null;
let unloadBound = false;

async function send(event: "login" | "ping" | "logout"): Promise<void> {
  try {
    const token = await getSessionToken();
    if (!token) return;
    await fetch("/api/presence", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ event }),
      keepalive: event === "logout",
    });
  } catch {
    /* presence is best-effort */
  }
}

function handleUnload() {
  // navigator.sendBeacon can't set an Authorization header, so rely on the
  // server's short online window to age the session out after the tab closes.
  void send("logout");
}

export function startPresence(): void {
  void send("login");
  if (timer) clearInterval(timer);
  timer = setInterval(() => void send("ping"), PING_INTERVAL_MS);

  if (typeof window !== "undefined" && !unloadBound) {
    window.addEventListener("pagehide", handleUnload);
    window.addEventListener("beforeunload", handleUnload);
    unloadBound = true;
  }
}

export function stopPresence(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (typeof window !== "undefined" && unloadBound) {
    window.removeEventListener("pagehide", handleUnload);
    window.removeEventListener("beforeunload", handleUnload);
    unloadBound = false;
  }
  void send("logout");
}
