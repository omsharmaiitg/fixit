"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "motion/react";
import { updateProfile } from "firebase/auth";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { ArrowLeft, Camera, Loader2, Check } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { CitySwitcher } from "@/components/CitySwitcher";
import { getFirebaseStorage, getDb } from "@/lib/firebase";

function initialsOf(name?: string | null, email?: string | null): string {
  const base = (name || email || "").trim();
  if (!base) return "?";
  const parts = base.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

export default function EditProfilePage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [photoOverride, setPhotoOverride] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Seed the form from auth (name) + the user doc (bio).
  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/auth");
      return;
    }
    setName(user.displayName ?? "");
    let alive = true;
    getDoc(doc(getDb(), "users", user.uid))
      .then((snap) => {
        if (alive && typeof snap.data()?.bio === "string") setBio(snap.data()!.bio);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [loading, user, router]);

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingPhoto(true);
    setError(null);
    try {
      const r = ref(getFirebaseStorage(), `avatars/${user.uid}`);
      await uploadBytes(r, file);
      const url = await getDownloadURL(r);
      await updateProfile(user, { photoURL: url });
      await setDoc(doc(getDb(), "users", user.uid), { photoURL: url }, { merge: true });
      setPhotoOverride(url);
    } catch {
      setError("Couldn't update your photo. Please try again.");
    } finally {
      setUploadingPhoto(false);
      e.target.value = "";
    }
  }

  async function handleSave() {
    if (!user) return;
    if (!name.trim()) {
      setError("Please enter your name.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateProfile(user, { displayName: name.trim() });
      await setDoc(
        doc(getDb(), "users", user.uid),
        { displayName: name.trim(), bio: bio.trim() },
        { merge: true },
      );
      router.push("/profile");
    } catch {
      setError("Couldn't save your profile. Please try again.");
      setSaving(false);
    }
  }

  if (loading || !user) {
    return (
      <div className="mx-auto w-full max-w-md px-5">
        <Header />
        <div className="mt-6 space-y-3">
          <div className="h-24 animate-pulse rounded-2xl bg-slate-200" />
          <div className="h-20 animate-pulse rounded-2xl bg-slate-200" />
        </div>
      </div>
    );
  }

  const avatarUrl = photoOverride ?? user.photoURL;

  return (
    <div className="mx-auto w-full max-w-md px-5 pb-24">
      <Header />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="mt-2 space-y-5"
      >
        {/* photo */}
        <section className="flex flex-col items-center rounded-2xl bg-surface p-5 shadow-card">
          <div className="relative">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-primary/10 font-display text-2xl font-bold text-primary">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="avatar" className="h-full w-full object-cover" />
              ) : (
                initialsOf(name, user.email)
              )}
            </div>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploadingPhoto}
              aria-label="Change photo"
              className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white shadow-card transition active:scale-95"
            >
              {uploadingPhoto ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={onPickAvatar}
              className="hidden"
            />
          </div>
          <p className="mt-2 text-xs text-muted">Tap the camera to change your photo</p>
        </section>

        {/* fields */}
        <section className="space-y-4 rounded-2xl bg-surface p-4 shadow-card">
          <Field label="Display name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className={inputClass}
            />
          </Field>

          <Field label="Bio">
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="A line about you and your civic streak…"
              rows={3}
              maxLength={160}
              className={`${inputClass} resize-none`}
            />
            <span className="mt-1 block text-right text-[11px] text-muted">{bio.length}/160</span>
          </Field>

          <Field label="Email">
            <input value={user.email ?? ""} readOnly disabled className={`${inputClass} opacity-60`} />
            <span className="mt-1 block text-[11px] text-muted">
              Email is your sign-in identity and can&apos;t be changed here.
            </span>
          </Field>
        </section>

        {/* city */}
        <section className="rounded-2xl bg-surface p-4 shadow-card">
          <h3 className="mb-1 font-display text-sm font-bold text-foreground">Your city</h3>
          <p className="mb-3 text-xs text-muted">
            Your feed shows issues within 65 km of your city.
          </p>
          <CitySwitcher />
        </section>

        {error && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}
      </motion.div>

      {/* save */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="sticky bottom-4 mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 font-display font-bold text-white shadow-card-lg transition active:scale-[0.98] disabled:opacity-60"
      >
        {saving ? (
          <>
            <Loader2 size={18} className="animate-spin" /> Saving…
          </>
        ) : (
          <>
            <Check size={18} strokeWidth={2.5} /> Save profile
          </>
        )}
      </button>
    </div>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-surface px-3.5 py-2.5 text-sm outline-none placeholder:text-muted focus:border-primary";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-foreground">{label}</span>
      {children}
    </label>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-40 -mx-5 flex items-center gap-3 bg-background/85 px-5 py-3 backdrop-blur-md">
      <Link
        href="/profile"
        aria-label="Back to profile"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-foreground shadow-card transition active:scale-95"
      >
        <ArrowLeft size={18} />
      </Link>
      <h1 className="font-display text-xl font-extrabold tracking-tight text-primary-dark">
        Edit profile
      </h1>
    </header>
  );
}
