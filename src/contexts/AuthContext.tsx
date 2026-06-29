"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  type User as FirebaseUser,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { getFirebaseAuth, getDb } from "@/lib/firebase";
import { getDeviceId } from "@/lib/reporter";
import { backfillDeviceReports } from "@/lib/firebaseHelpers";

interface AuthContextValue {
  user: FirebaseUser | null;
  loading: boolean;
  error: string | null;
  registerWithEmail: (name: string, email: string, password: string) => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function friendlyAuthError(e: unknown): string {
  const code = (e as { code?: string }).code ?? "";
  switch (code) {
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Email or password is incorrect.";
    case "auth/user-not-found":
      return "No account found with that email.";
    case "auth/email-already-in-use":
      return "That email is already registered. Try logging in instead.";
    case "auth/invalid-email":
      return "That doesn't look like a valid email address.";
    case "auth/weak-password":
      return "Password should be at least 6 characters.";
    case "auth/popup-closed-by-user":
      return "Google sign-in was cancelled.";
    case "auth/popup-blocked":
      return "Your browser blocked the sign-in popup. Allow popups and retry.";
    case "auth/network-request-failed":
      return "Network error. Check your connection and try again.";
    default:
      return (e as Error)?.message ?? "Something went wrong. Please try again.";
  }
}

// Create the users/{uid} doc on first sign-in; on later sign-ins refresh the
// mutable profile fields without clobbering createdAt / points.
async function upsertUserDoc(u: FirebaseUser): Promise<void> {
  const ref = doc(getDb(), "users", u.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      uid: u.uid,
      displayName: u.displayName ?? "",
      email: u.email ?? "",
      photoURL: u.photoURL ?? null,
      createdAt: new Date(),
      points: 0,
    });
  } else {
    await setDoc(
      ref,
      {
        displayName: u.displayName ?? "",
        email: u.email ?? "",
        photoURL: u.photoURL ?? null,
      },
      { merge: true },
    );
  }
}

// Once per device per uid: move the device's anonymous reports onto the account.
async function runBackfillOnce(uid: string): Promise<void> {
  if (typeof window === "undefined") return;
  const key = `fixit_backfilled_${uid}`;
  try {
    if (localStorage.getItem(key)) return;
    await backfillDeviceReports(getDeviceId(), uid);
    localStorage.setItem(key, "1");
  } catch {
    /* non-fatal — reports just stay under the device id */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unsub = () => {};
    try {
      unsub = onAuthStateChanged(getFirebaseAuth(), (u) => {
        setUser(u);
        setLoading(false);
        if (u) void runBackfillOnce(u.uid);
      });
    } catch (e) {
      // Only reached if Firebase auth fails to init (e.g. bad config). The happy
      // path flips loading off inside the async onAuthStateChanged callback.
      console.error("[auth] init failed", e);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
    }
    return () => unsub();
  }, []);

  async function registerWithEmail(name: string, email: string, password: string) {
    setError(null);
    try {
      const cred = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
      await updateProfile(cred.user, { displayName: name });
      await upsertUserDoc(cred.user);
    } catch (e) {
      const m = friendlyAuthError(e);
      setError(m);
      throw new Error(m);
    }
  }

  async function loginWithEmail(email: string, password: string) {
    setError(null);
    try {
      const cred = await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
      await upsertUserDoc(cred.user);
    } catch (e) {
      const m = friendlyAuthError(e);
      setError(m);
      throw new Error(m);
    }
  }

  async function signInWithGoogle() {
    setError(null);
    try {
      const cred = await signInWithPopup(getFirebaseAuth(), new GoogleAuthProvider());
      await upsertUserDoc(cred.user);
    } catch (e) {
      const m = friendlyAuthError(e);
      setError(m);
      throw new Error(m);
    }
  }

  async function signOut() {
    await fbSignOut(getFirebaseAuth());
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        registerWithEmail,
        loginWithEmail,
        signInWithGoogle,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
