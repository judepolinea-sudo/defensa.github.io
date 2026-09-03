import { initializeApp } from 'firebase/app';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, signOut,
} from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

// Firebase is used for AUTH ONLY — all application data lives in Supabase.
// (No firebase/firestore import: it added ~250 KB to the first-load bundle
// for a single throwaway connection check.)
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Auth Helpers
export const loginWithGoogle = () => signInWithPopup(auth, googleProvider);
// Redirect-based fallback — doesn't rely on a popup window, so it isn't
// affected by popup blockers or third-party-cookie restrictions that can
// silently break the popup postMessage handshake (common on localhost).
export const loginWithGoogleRedirect = () => signInWithRedirect(auth, googleProvider);
export const getGoogleRedirectResult = () => getRedirectResult(auth);
export const logout = () => signOut(auth);
