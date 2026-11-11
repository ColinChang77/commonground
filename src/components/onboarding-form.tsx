"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { saveProfile } from "@/server/profile";
import { CATEGORIES, OPEN_TO, type CategoryId } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormError } from "@/components/form-field";
import { ChoiceChips, TagInput } from "@/components/tag-input";
import { UserAvatar } from "@/components/user-avatar";
import { useImageUpload } from "@/components/image-upload";

const SKILL_SUGGESTIONS = ["Writing", "Design", "Illustration", "Research", "Marketing", "Community building", "Teaching", "Video", "Photography", "React", "Python", "Data analysis", "Fundraising", "Event planning"];

export type ProfileFormValues = {
  username: string;
  displayName: string;
  bio: string;
  avatarKey: string | null;
  interests: CategoryId[];
  skills: string[];
  openTo: string[];
  hoursPerWeek?: number;
};

export function ProfileForm({ initial, mode, next = "/" }: { initial: ProfileFormValues; mode: "onboarding" | "edit"; next?: string }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { upload, pending: uploading } = useImageUpload("avatar");
  const set = <K extends keyof ProfileFormValues>(k: K, val: ProfileFormValues[K]) => setV((p) => ({ ...p, [k]: val }));

  async function save() {
    setPending(true);
    setError(null);
    const res = await saveProfile(v);
    setPending(false);
    if (!res.ok) {
      setErrors(res.fieldErrors ?? {});
      setError(res.error);
      if (res.fieldErrors?.username || res.fieldErrors?.displayName) setStep(0);
      return;
    }
    toast.success(res.message);
    router.push(mode === "onboarding" ? next : `/u/${res.data.username}`);
    router.refresh();
  }

  const basics = (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <UserAvatar name={v.displayName || "?"} avatarKey={v.avatarKey} size={72} />
        <div className="flex flex-col gap-1">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="sr-only"
            aria-label="Upload profile photo"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) {
                const key = await upload(f);
                if (key) set("avatarKey", key);
              }
            }}
          />
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="animate-spin" /> : <Camera />} {v.avatarKey ? "Change photo" : "Add photo"}
          </Button>
          {v.avatarKey && (
            <button type="button" className="text-left text-xs text-muted-foreground hover:text-foreground" onClick={() => set("avatarKey", null)}>
              Remove photo
            </button>
          )}
        </div>
      </div>
      <Field label="Display name" htmlFor="displayName" error={errors.displayName}>
        <Input id="displayName" value={v.displayName} maxLength={60} onChange={(e) => set("displayName", e.target.value)} />
      </Field>
      <Field label="Username" htmlFor="username" error={errors.username} hint="Letters, numbers and underscores. This is your profile link.">
        <div className="flex items-center rounded-lg border focus-within:ring-3 focus-within:ring-ring/50">
          <span className="pl-3 text-sm text-muted-foreground">commonground/u/</span>
          <input id="username" value={v.username} maxLength={30} onChange={(e) => set("username", e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))} className="h-8 min-w-0 flex-1 bg-transparent pr-3 text-sm outline-none" autoComplete="username" />
        </div>
      </Field>
      <Field label="Short bio" htmlFor="bio" optional error={errors.bio} hint={`${v.bio.length}/280`}>
        <Textarea id="bio" value={v.bio} maxLength={280} rows={3} placeholder="What do you care about? What are you working on?" onChange={(e) => set("bio", e.target.value)} />
      </Field>
    </div>
  );

  const interests = (
    <div className="flex flex-col gap-6">
      <Field label="What are you interested in?" htmlFor="interests" optional hint="We use this to shape your For You feed.">
        <ChoiceChips label="Interests" options={CATEGORIES} value={v.interests} onChange={(x) => set("interests", x)} />
      </Field>
      <Field label="Skills you can offer" htmlFor="skills" optional hint="Press Enter after each one.">
        <TagInput id="skills" value={v.skills} onChange={(x) => set("skills", x)} placeholder="e.g. Illustration, Python, Event planning" suggestions={SKILL_SUGGESTIONS} />
      </Field>
    </div>
  );

  const prefs = (
    <div className="flex flex-col gap-6">
      <Field label="I'm open to…" htmlFor="openTo" optional>
        <ChoiceChips label="Open to" options={OPEN_TO} value={v.openTo as (typeof OPEN_TO)[number]["id"][]} onChange={(x) => set("openTo", x)} />
      </Field>
      <Field label="Hours per week I can usually give" htmlFor="hours" optional>
        <Input id="hours" type="number" min={0} max={80} className="w-28" value={v.hoursPerWeek ?? ""} onChange={(e) => set("hoursPerWeek", e.target.value === "" ? undefined : Number(e.target.value))} />
      </Field>
    </div>
  );

  if (mode === "edit")
    return (
      <div className="flex flex-col gap-8">
        <FormError message={error} />
        {basics}
        {interests}
        {prefs}
        <div>
          <Button onClick={save} disabled={pending}>{pending ? "Saving…" : "Save profile"}</Button>
        </div>
      </div>
    );

  const steps = [
    { title: "Introduce yourself", body: basics, canNext: v.displayName.trim().length > 0 && v.username.length >= 3 },
    { title: "What you're into", body: interests, canNext: true },
    { title: "How you like to collaborate", body: prefs, canNext: true },
  ];
  const s = steps[step];
  return (
    <div className="flex flex-col gap-6">
      <ol className="flex gap-1.5" aria-label={`Step ${step + 1} of ${steps.length}`}>
        {steps.map((_, i) => (
          <li key={i} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`} />
        ))}
      </ol>
      <h1 className="text-2xl font-semibold">{s.title}</h1>
      <FormError message={error} />
      {s.body}
      <div className="flex items-center justify-between gap-2 pt-2">
        {step > 0 ? <Button variant="ghost" onClick={() => setStep(step - 1)}>Back</Button> : <span />}
        <div className="flex gap-2">
          {step > 0 && step < steps.length - 1 && <Button variant="ghost" onClick={() => setStep(step + 1)}>Skip</Button>}
          {step < steps.length - 1 ? (
            <Button onClick={() => setStep(step + 1)} disabled={!s.canNext}>Continue</Button>
          ) : (
            <Button onClick={save} disabled={pending}>{pending ? "Saving…" : "Finish"}</Button>
          )}
        </div>
      </div>
    </div>
  );
}
