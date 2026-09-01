import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  getIdToken,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  type User as FirebaseUser,
} from "firebase/auth";
import {
  auth,
  loginWithGoogle as firebaseLoginWithGooglePopup,
  loginWithGoogleRedirect,
  getGoogleRedirectResult,
} from "../src/firebase";
import { User } from "../types";

// Thrown by fetchProfileOrThrow so callers (LoginView) can distinguish
// "pending admin approval" from a generic sign-in failure via .code.
export class ProfileFetchError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "ProfileFetchError";
    this.code = code;
  }
}

async function fetchProfileFromBackend(token: string): Promise<User | null> {
  try {
    const res = await fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.user as User;
  } catch {
    return null;
  }
}

// Same request as fetchProfileFromBackend, but surfaces the backend's error
// message/code instead of collapsing every failure to null — used by the
// explicit login flows (email/password, Google) so the UI can react
// specifically to e.g. a pending self-registration.
async function fetchProfileOrThrow(token: string): Promise<User> {
  const res = await fetch("/api/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ProfileFetchError(data.message || "Sign-in failed. Please try again.", data.code);
  }
  return data.user as User;
}

async function resolveGoogleUser(firebaseUser: FirebaseUser): Promise<User> {
  const token = await getIdToken(firebaseUser);
  try {
    return await fetchProfileOrThrow(token);
  } catch (err) {
    await signOut(auth);
    throw err;
  }
}

const REMEMBER_KEY = "defensa.rememberMe";
const REMEMBER_EMAIL_KEY = "defensa.rememberedEmail";

// "Remember me" checked  -> browserLocalPersistence  (survives browser restart)
// unchecked              -> browserSessionPersistence (cleared when the tab/browser closes)
export const applyAuthPersistence = async (remember: boolean): Promise<void> => {
  try {
    await setPersistence(
      auth,
      remember ? browserLocalPersistence : browserSessionPersistence,
    );
    if (typeof window !== "undefined") {
      window.localStorage.setItem(REMEMBER_KEY, remember ? "1" : "0");
    }
  } catch (err) {
    console.warn("Could not set auth persistence:", err);
  }
};

export const getRememberedLogin = (): { remember: boolean; email: string } => {
  if (typeof window === "undefined") return { remember: true, email: "" };
  return {
    remember: window.localStorage.getItem(REMEMBER_KEY) !== "0",
    email: window.localStorage.getItem(REMEMBER_EMAIL_KEY) ?? "",
  };
};

export const setRememberedEmail = (email: string, remember: boolean): void => {
  if (typeof window === "undefined") return;
  if (remember && email) {
    window.localStorage.setItem(REMEMBER_EMAIL_KEY, email);
  } else {
    window.localStorage.removeItem(REMEMBER_EMAIL_KEY);
  }
};

// Submits a password reset request for admin approval. The backend validates
// the email against the Supabase users table and holds the new password
// (encrypted) in password_reset_requests until an admin approves it — nothing
// changes in Firebase until then. Returns the backend's message to show.
export const requestPasswordReset = async (
  email: string,
  newPassword: string,
): Promise<string> => {
  const normalized = email.trim().toLowerCase();
  const res = await fetch("/api/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: normalized, newPassword }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || "Could not submit the password reset. Please try again.");
  }
  return (
    data.message ||
    "Your password reset request has been submitted and is awaiting admin approval."
  );
};

export const loginUser = async (
  email: string,
  pass: string,
  remember = true,
): Promise<User> => {
  await applyAuthPersistence(remember);
  const userCredential = await signInWithEmailAndPassword(auth, email, pass);
  const token = await getIdToken(userCredential.user);
  try {
    return await fetchProfileOrThrow(token);
  } catch (err) {
    await signOut(auth);
    throw err;
  }
};

export const registerUser = async (params: {
  email: string;
  password: string;
  fullName: string;
  program?: string;
  yearLevel?: string;
}): Promise<void> => {
  const res = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || "Registration failed. Please try again.");
  }
};

// Popup-blocked or third-party-cookie-restricted environments (common on
// localhost in Chrome/Edge) can silently prevent the popup handshake from
// ever completing — window.open() returns null and nothing visibly happens.
// When that specific failure occurs, fall back to a full-page redirect,
// which doesn't depend on a popup at all.
const POPUP_UNAVAILABLE_CODES = [
  "auth/popup-blocked",
  "auth/operation-not-supported-in-this-environment",
];

// Module-level guard: if something calls loginWithGoogle() a second time
// while one is already in flight — a double-click before React's disabled
// state commits, a stray duplicate listener from hot-reload, anything —
// every caller gets the SAME in-flight promise instead of opening a second
// popup.
let inFlightGoogleLogin: Promise<User> | null = null;

export const loginWithGoogle = (remember = true): Promise<User> => {
  if (inFlightGoogleLogin) return inFlightGoogleLogin;

  inFlightGoogleLogin = (async () => {
    try {
      await applyAuthPersistence(remember);
      const userCredential = await firebaseLoginWithGooglePopup();
      return await resolveGoogleUser(userCredential.user);
    } catch (err: any) {
      if (POPUP_UNAVAILABLE_CODES.includes(err.code)) {
        await loginWithGoogleRedirect();
        // Page is navigating away to Google — this intentionally never settles.
        return new Promise<User>(() => {});
      }
      throw err;
    } finally {
      inFlightGoogleLogin = null;
    }
  })();

  return inFlightGoogleLogin;
};

// Only checks for a genuine Firebase/Google-level redirect failure (e.g. the
// OAuth exchange itself was rejected). Does NOT resolve the app profile —
// subscribeToAuthChanges/onAuthStateChanged below already does that for
// every sign-in method.
export const checkGoogleRedirectResult = async (): Promise<void> => {
  await getGoogleRedirectResult();
};

export const logoutUser = async () => {
  await signOut(auth);
};

export const getSessionToken = async (): Promise<string | null> => {
  if (!auth.currentUser) return null;
  return await getIdToken(auth.currentUser);
};

export const subscribeToAuthChanges = (
  callback: (user: User | null) => void,
) => {
  return onAuthStateChanged(auth, async (firebaseUser) => {
    if (firebaseUser) {
      const token = await getIdToken(firebaseUser);
      const profile = await fetchProfileFromBackend(token);
      callback(profile);
    } else {
      callback(null);
    }
  });
};
