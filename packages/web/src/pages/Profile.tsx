import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import {
  ArrowRight, BadgeCheck, BriefcaseBusiness, Camera, Check, CheckCircle2, FileText,
  GraduationCap, Mail, MapPin, Phone, Plus, Sparkles, Target, Trash2, UploadCloud,
  UserRound, UserRoundCheck, X,
} from 'lucide-react';
import { candidate } from '@/lib/api';
import { CandidateProfile } from '@/lib/types';
import { useAuthStore } from '@/stores/auth';
import { PageLoader } from '@/components/ui/spinner';
import { cn } from '@/components/ui/cn';
import { AVATAR_PRESETS, ProfileAvatar } from '@/components/candidate/ProfileAvatar';
import { imageFileToAvatarDataUrl } from '@/lib/avatar';

const EASE = [0.22, 1, 0.36, 1] as const;

const emptyProfile: CandidateProfile = {
  full_name: '', headline: '', contact_email: '', phone: '', location: '', summary: '',
  skills: [], preferred_roles: [], preferred_locations: [], remote_preference: 'any',
  experience_years: 0, education_level: '', salary_min: null, salary_currency: 'INR',
  experience: [], projects: [], certifications: [], resume_filename: null,
  avatar_id: 'ember', avatar_url: null,
};

const splitList = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean);

const sectionLinks = [
  { id: 'photo', label: 'Profile photo', icon: Camera },
  { id: 'about', label: 'About you', icon: UserRound },
  { id: 'skills', label: 'Skills & preferences', icon: Sparkles },
  { id: 'experience', label: 'Experience', icon: BriefcaseBusiness },
  { id: 'projects', label: 'Projects', icon: GraduationCap },
  { id: 'account', label: 'Account & privacy', icon: UserRoundCheck },
];

function Field({ label, hint, children, className = '' }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={className}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[10.5px] leading-relaxed text-muted-foreground">{hint}</span>}
    </label>
  );
}

function CompletionRing({ value }: { value: number }) {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const complete = Math.max(0, Math.min(100, value));
  return (
    <div className="relative grid h-[108px] w-[108px] shrink-0 place-items-center" role="img" aria-label={`Profile ${complete} percent complete`}>
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 108 108">
        <circle cx="54" cy="54" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="7" />
        <circle cx="54" cy="54" r={radius} fill="none" stroke="hsl(var(--primary))" strokeLinecap="round" strokeWidth="7" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - complete / 100)} />
      </svg>
      <span className="font-mono text-[24px] font-semibold tabular-nums tracking-[-0.03em] text-foreground">{complete}%</span>
    </div>
  );
}

function FormSection({
  id, eyebrow, title, description, action, children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3.5">
        <div className="min-w-0">
          <p className="eyebrow text-primary">{eyebrow}</p>
          <h2 className="mt-1 text-[16px] font-semibold tracking-[-0.02em] text-foreground">{title}</h2>
          {description && <p className="mt-1 max-w-2xl text-[11.5px] leading-relaxed text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function HeroMetric({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface/80 px-3 py-2.5 text-center backdrop-blur">
      <p className="font-mono text-[18px] font-semibold leading-none tabular-nums tracking-[-0.03em] text-foreground">{value}</p>
      <p className="mt-1 font-mono text-[8.5px] uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
    </div>
  );
}

const Profile: React.FC = () => {
  const client = useQueryClient();
  const { user, logout, revokeCurrentToken } = useAuthStore();
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery('candidate-profile', candidate.profile);
  const [profile, setProfile] = useState<CandidateProfile>(emptyProfile);
  const [skillsText, setSkillsText] = useState('');
  const [rolesText, setRolesText] = useState('');
  const [locationsText, setLocationsText] = useState('');
  const [certsText, setCertsText] = useState('');
  const [notice, setNotice] = useState('');
  const [avatarError, setAvatarError] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');

  const saveMutation = useMutation((value: CandidateProfile) => candidate.saveProfile(value), {
    onSuccess: (result: any) => {
      client.setQueryData('candidate-profile', result);
      client.invalidateQueries('candidate-summary');
      client.invalidateQueries('candidate-recommendations');
      setNotice('Profile saved. Your matches will refresh with the new details.');
      setAvatarError('');
    },
  });

  const avatarMutation = useMutation(
    (values: { avatar_id: string; avatar_url?: string | null }) => candidate.saveAvatar(values),
    {
      onSuccess: (result) => {
        client.setQueryData('candidate-profile', (current: any) => current?.profile
          ? { ...current, profile: { ...current.profile, ...result } }
          : current);
        setAvatarError('');
      },
      onError: (mutationError: Error) => setAvatarError(mutationError.message),
    },
  );

  const parseMutation = useMutation((file: File) => candidate.parseResume(file), {
    onSuccess: (result) => {
      const suggestions = result.suggested_profile;
      setProfile((current) => ({
        ...current,
        ...suggestions,
        resume_filename: result.filename,
        skills: suggestions.skills || current.skills,
        experience: suggestions.experience?.length ? suggestions.experience : current.experience,
        projects: suggestions.projects?.length ? suggestions.projects : current.projects,
        preferred_roles: current.preferred_roles,
        preferred_locations: current.preferred_locations,
        certifications: suggestions.certifications?.length ? suggestions.certifications : current.certifications,
      }));
      if (suggestions.skills) setSkillsText(suggestions.skills.join(', '));
      if (suggestions.certifications) setCertsText(suggestions.certifications.join(', '));
      setNotice(`Extracted suggestions from ${result.filename}. Review each field, correct anything needed, then save to confirm.`);
    },
  });

  const deleteMutation = useMutation(() => candidate.deleteAccount(deletePassword), {
    onSuccess: async () => {
      await revokeCurrentToken();
      await logout();
      navigate('/login');
    },
  });

  useEffect(() => {
    if (!data?.profile) return;
    setProfile({
      ...emptyProfile,
      ...data.profile,
      skills: data.profile.skills || [],
      preferred_roles: data.profile.preferred_roles || [],
      preferred_locations: data.profile.preferred_locations || [],
      experience: data.profile.experience || [],
      projects: data.profile.projects || [],
      certifications: data.profile.certifications || [],
      avatar_id: data.profile.avatar_id || 'ember',
      avatar_url: data.profile.avatar_url || null,
    });
    setSkillsText((data.profile.skills || []).join(', '));
    setRolesText((data.profile.preferred_roles || []).join(', '));
    setLocationsText((data.profile.preferred_locations || []).join(', '));
    setCertsText((data.profile.certifications || []).join(', '));
  }, [data?.profile]);

  const update = (key: keyof CandidateProfile, value: any) => setProfile((current) => ({ ...current, [key]: value }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    saveMutation.mutate({
      ...profile,
      skills: splitList(skillsText),
      preferred_roles: splitList(rolesText),
      preferred_locations: splitList(locationsText),
      certifications: splitList(certsText),
      experience_years: Number(profile.experience_years || 0),
      salary_min: profile.salary_min === null || profile.salary_min === undefined || profile.salary_min === ('' as any) ? null : Number(profile.salary_min),
    });
  };

  const addExperience = () => update('experience', [...profile.experience, { title: '', company: '', period: '', description: '' }]);
  const addProject = () => update('projects', [...profile.projects, { name: '', description: '', technologies: [] }]);

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const skillChips = useMemo(() => splitList(skillsText), [skillsText]);
  const roleChips = useMemo(() => splitList(rolesText), [rolesText]);
  const completion = Math.round(data?.completion ?? 0);
  const displayName = profile.full_name?.trim() || user?.email || 'Your profile';

  const checklist = [
    { label: 'Name and headline', complete: Boolean(profile.full_name && profile.headline) },
    { label: 'Location', complete: Boolean(profile.location) },
    { label: 'Core skills', complete: profile.skills.length > 0 || skillChips.length > 0 },
    { label: 'Preferred roles', complete: profile.preferred_roles.length > 0 || roleChips.length > 0 },
    { label: 'Education', complete: Boolean(profile.education_level) },
    { label: 'Project or experience', complete: profile.projects.length > 0 || profile.experience.length > 0 },
  ];
  const checklistDone = checklist.filter((item) => item.complete).length;
  const errorText = avatarError || (parseMutation.error ? (parseMutation.error as Error).message : '') || (saveMutation.error ? (saveMutation.error as Error).message : '');

  const chooseAvatar = (avatarId: string) => {
    update('avatar_id', avatarId);
    update('avatar_url', null);
    setAvatarError('');
    avatarMutation.mutate({ avatar_id: avatarId, avatar_url: null });
  };

  const removeAvatar = () => {
    update('avatar_url', null);
    setAvatarError('');
    avatarMutation.mutate({ avatar_id: profile.avatar_id || 'ember', avatar_url: null });
  };

  const handleAvatarFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    try {
      const dataUrl = await imageFileToAvatarDataUrl(file);
      update('avatar_url', dataUrl);
      setAvatarError('');
      avatarMutation.mutate({ avatar_id: profile.avatar_id || 'ember', avatar_url: dataUrl });
    } catch (uploadError) {
      setAvatarError((uploadError as Error).message);
    }
  };

  if (isLoading) return <PageLoader label="Loading your profile…" />;
  if (error) return <div className="card p-5 text-[13px] text-destructive">{(error as Error).message}</div>;

  return (
    <div className="space-y-5 pb-4">
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: EASE }}
        className="relative overflow-hidden rounded-[26px] border border-border bg-[linear-gradient(115deg,hsl(var(--surface))_0%,hsl(var(--accent))_56%,hsl(var(--primary-soft))_100%)] p-5 shadow-sm sm:p-6"
      >
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full border border-primary/10" />
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-primary/[0.06] blur-2xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-5">
          <div className="min-w-0">
            <p className="eyebrow flex items-center gap-2 text-primary"><Sparkles className="h-3.5 w-3.5" /> Your identity</p>
            <h1 className="mt-2 text-[29px] font-semibold leading-[1.06] tracking-[-0.04em] text-foreground sm:text-[36px]">Your profile, your story.</h1>
            <p className="mt-2 max-w-xl text-[12.5px] leading-relaxed text-muted-foreground sm:text-[13px]">
              The source of truth for matching and application drafts. Resume extraction stays a suggestion until you review and save.
            </p>
          </div>
          <div className="grid min-w-[250px] grid-cols-3 gap-2">
            <HeroMetric value={`${completion}%`} label="Complete" />
            <HeroMetric value={skillChips.length || profile.skills.length} label="Skills" />
            <HeroMetric value={`${Number(profile.experience_years || 0)}y`} label="Experience" />
          </div>
        </div>
      </motion.section>

      <div className="grid gap-5 xl:grid-cols-[310px_minmax(0,1fr)] xl:items-start">
        <aside className="space-y-4 xl:sticky xl:top-4">
          <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
            <div className="flex flex-col items-center text-center">
              <ProfileAvatar avatarId={profile.avatar_id} src={profile.avatar_url} name={displayName} size={88} className="ring-2 ring-surface shadow-sm" />
              <h2 className="mt-3 max-w-full truncate text-[16px] font-semibold tracking-[-0.02em] text-foreground">{profile.full_name || 'Add your name'}</h2>
              <p className="mt-0.5 max-w-full truncate text-[11.5px] text-muted-foreground">{profile.headline || 'Add a professional headline'}</p>
              {profile.profile_confirmed_at && (
                <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-success/25 bg-success-soft px-2 py-0.5 text-[9.5px] font-medium text-success">
                  <BadgeCheck className="h-3 w-3" /> Confirmed {new Date(profile.profile_confirmed_at).toLocaleDateString()}
                </span>
              )}
            </div>

            <div className="mt-4 flex items-center gap-3 rounded-xl border border-border bg-muted/20 p-3">
              <CompletionRing value={completion} />
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-foreground">{checklistDone} of {checklist.length} essentials</p>
                <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">Complete every item to unlock stronger matches.</p>
              </div>
            </div>

            <ul className="mt-3 space-y-1.5">
              {checklist.map((item) => (
                <li key={item.label} className="flex items-center gap-2 text-[11px]">
                  {item.complete ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <span className="h-3.5 w-3.5 rounded-full border border-border" />}
                  <span className={item.complete ? 'text-foreground' : 'text-muted-foreground'}>{item.label}</span>
                </li>
              ))}
            </ul>

            <div className="mt-4 space-y-1.5 border-t border-border pt-3 text-[11px] text-muted-foreground">
              <p className="flex items-center gap-2 truncate"><Mail className="h-3.5 w-3.5 shrink-0" />{profile.contact_email || user?.email}</p>
              {profile.phone && <p className="flex items-center gap-2 truncate"><Phone className="h-3.5 w-3.5 shrink-0" />{profile.phone}</p>}
              {profile.location && <p className="flex items-center gap-2 truncate"><MapPin className="h-3.5 w-3.5 shrink-0" />{profile.location}</p>}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Link to="/recommendations" className="group flex flex-col rounded-lg border border-border bg-muted/20 p-2.5 text-[10.5px] font-semibold text-foreground transition-colors hover:border-border-strong hover:bg-surface">
                <Target className="h-3.5 w-3.5 text-primary" /> For you <ArrowRight className="mt-1 h-3 w-3 self-end text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link to="/resume" className="group flex flex-col rounded-lg border border-border bg-muted/20 p-2.5 text-[10.5px] font-semibold text-foreground transition-colors hover:border-border-strong hover:bg-surface">
                <FileText className="h-3.5 w-3.5 text-success" /> Resume <ArrowRight className="mt-1 h-3 w-3 self-end text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>

            <button
              type="submit"
              form="profile-form"
              disabled={saveMutation.isLoading}
              className="mt-2 inline-flex h-9 w-full items-center justify-center rounded-lg bg-primary text-[11.5px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
            >
              {saveMutation.isLoading ? 'Saving…' : 'Save profile changes'}
            </button>
            <p className="mt-1.5 text-center text-[9.5px] text-muted-foreground">Photo changes save instantly. Other edits save here.</p>
          </section>

          <nav aria-label="Profile sections" className="rounded-2xl border border-border bg-surface p-2 shadow-sm">
            {sectionLinks.map(({ id, label, icon: Icon }) => (
              <button key={id} type="button" onClick={() => scrollTo(id)} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[11.5px] font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground">
                <Icon className="h-3.5 w-3.5" />{label}
              </button>
            ))}
          </nav>
        </aside>

        <div className="min-w-0 space-y-4">
          <section id="photo" className="scroll-mt-20 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="flex flex-col items-center gap-2">
                <ProfileAvatar avatarId={profile.avatar_id} src={profile.avatar_url} name={displayName} size={96} className="ring-2 ring-surface shadow-sm" />
                <span className={cn('font-mono text-[8.5px] uppercase tracking-[0.12em]', avatarMutation.isLoading ? 'text-primary' : 'text-muted-foreground')}>
                  {avatarMutation.isLoading ? 'Saving photo…' : 'Live preview'}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="eyebrow text-primary">First impression</p>
                    <h2 className="mt-1 text-[16px] font-semibold tracking-[-0.02em] text-foreground">Profile photo</h2>
                    <p className="mt-1 max-w-xl text-[11.5px] leading-relaxed text-muted-foreground">
                      Pick an illustrated face or upload a square photo. Uploads are centre-cropped and compressed in your browser before saving.
                    </p>
                  </div>
                  <label className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface px-3 text-[11.5px] font-semibold text-foreground transition-colors hover:border-border-strong hover:bg-accent/60">
                    <Camera className="h-3.5 w-3.5 text-primary" /> Upload photo
                    <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={handleAvatarFile} />
                  </label>
                </div>

                <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
                  {AVATAR_PRESETS.map((preset) => {
                    const selected = !profile.avatar_url && profile.avatar_id === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        aria-label={`Use ${preset.label} avatar`}
                        aria-pressed={selected}
                        onClick={() => chooseAvatar(preset.id)}
                        className={cn(
                          'group relative aspect-square rounded-xl border p-0.5 transition duration-150',
                          selected ? 'border-primary ring-2 ring-primary/25' : 'border-border hover:border-border-strong hover:bg-muted/30',
                        )}
                      >
                        <ProfileAvatar avatarId={preset.id} className="h-full w-full" />
                        {selected && <span className="absolute -bottom-1 -right-1 grid h-4 w-4 place-items-center rounded-full bg-primary text-primary-foreground ring-2 ring-surface"><Check className="h-2.5 w-2.5" /></span>}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[10px] text-muted-foreground">Illustrated faces are private to your account. A custom photo takes priority.</p>
                  {profile.avatar_url && (
                    <button type="button" onClick={removeAvatar} className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-destructive transition-colors hover:underline">
                      <X className="h-3 w-3" /> Remove photo
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-muted/30 text-muted-foreground"><UploadCloud className="h-4 w-4" strokeWidth={1.8} /></span>
              <div>
                <h2 className="text-[13px] font-semibold text-foreground">Extract from an existing resume</h2>
                <p className="mt-0.5 max-w-2xl text-[11px] leading-relaxed text-muted-foreground">PDF, DOCX or TXT up to 8 MB. Processed in memory and never stored; review every suggested field before saving.</p>
              </div>
            </div>
            <label className="inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3.5 text-[11.5px] font-semibold text-foreground transition-colors hover:border-border-strong hover:bg-accent/60">
              <UploadCloud className="h-3.5 w-3.5 text-muted-foreground" />{parseMutation.isLoading ? 'Reading resume…' : 'Choose resume'}
              <input
                type="file"
                accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                className="sr-only"
                disabled={parseMutation.isLoading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) { setNotice(''); setAvatarError(''); parseMutation.mutate(file); }
                  event.currentTarget.value = '';
                }}
              />
            </label>
          </section>

          {(notice || errorText) && (
            <div className={cn('rounded-xl border p-3 text-[11.5px] leading-relaxed', errorText ? 'border-destructive/25 bg-destructive-soft text-destructive' : 'border-info/25 bg-info-soft text-info')}>
              {errorText || notice}
            </div>
          )}

          <form id="profile-form" onSubmit={submit} className="space-y-4">
            <FormSection
              id="about"
              eyebrow="The basics"
              title="About you"
              description="Keep this factual. It powers matching, recruiter summaries and application drafts."
              action={<span className="rounded-md border border-primary/25 bg-primary-soft px-2 py-0.5 font-mono text-[10.5px] font-medium tabular-nums text-primary">Profile {completion}%</span>}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Full name"><input required value={profile.full_name} onChange={(event) => update('full_name', event.target.value)} className="input" placeholder="Your name" /></Field>
                <Field label="Professional headline"><input value={profile.headline} onChange={(event) => update('headline', event.target.value)} className="input" placeholder="e.g. Computer science graduate · Frontend developer" /></Field>
                <Field label="Contact email"><input type="email" value={profile.contact_email || ''} onChange={(event) => update('contact_email', event.target.value)} className="input" placeholder={user?.email || 'you@example.com'} /></Field>
                <Field label="Phone (optional)"><input value={profile.phone || ''} onChange={(event) => update('phone', event.target.value)} className="input" placeholder="+91…" /></Field>
                <Field label="Location"><input value={profile.location} onChange={(event) => update('location', event.target.value)} className="input" placeholder="City, country" /></Field>
                <Field label="Experience (years)"><input type="number" step="0.5" min="0" max="60" value={profile.experience_years} onChange={(event) => update('experience_years', event.target.value)} className="input" /></Field>
                <Field label="Education"><input value={profile.education_level} onChange={(event) => update('education_level', event.target.value)} className="input" placeholder="e.g. B.Tech Computer Science, 2026" /></Field>
                <Field label="Preferred work setup">
                  <select value={profile.remote_preference} onChange={(event) => update('remote_preference', event.target.value)} className="input">
                    <option value="any">Any</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="onsite">On-site</option>
                  </select>
                </Field>
                <Field label="Minimum salary expectation" className="md:col-span-2">
                  <div className="flex gap-2">
                    <select value={profile.salary_currency} onChange={(event) => update('salary_currency', event.target.value)} className="input w-24">
                      <option>INR</option><option>USD</option><option>EUR</option><option>GBP</option>
                    </select>
                    <input type="number" min="0" value={profile.salary_min ?? ''} onChange={(event) => update('salary_min', event.target.value === '' ? null : event.target.value)} className="input" placeholder="Optional annual expectation" />
                  </div>
                </Field>
                <Field label="Professional summary" hint="Two or three honest sentences about what you do best and what you want next." className="md:col-span-2">
                  <textarea rows={4} value={profile.summary} onChange={(event) => update('summary', event.target.value)} className="input h-auto min-h-[104px]" placeholder="A short summary of your strengths, projects and direction." />
                </Field>
              </div>
            </FormSection>

            <FormSection
              id="skills"
              eyebrow="Matching signals"
              title="Skills & preferences"
              description="Separate entries with commas. These fields decide which roles reach your For you page."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Core skills" hint="Use the tools and technologies you can defend in an interview." className="md:col-span-2">
                  <input value={skillsText} onChange={(event) => setSkillsText(event.target.value)} className="input" placeholder="React, TypeScript, SQL, Communication" />
                  {skillChips.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {skillChips.slice(0, 14).map((skill) => <span key={skill} className="rounded-md border border-success/25 bg-success-soft px-1.5 py-0.5 text-[10px] font-medium text-success">{skill}</span>)}
                      {skillChips.length > 14 && <span className="font-mono text-[10px] text-muted-foreground">+{skillChips.length - 14}</span>}
                    </div>
                  )}
                </Field>
                <Field label="Preferred roles" hint="Role titles you would genuinely accept.">
                  <input value={rolesText} onChange={(event) => setRolesText(event.target.value)} className="input" placeholder="Frontend Developer, Data Analyst" />
                </Field>
                <Field label="Preferred locations" hint="Cities or regions. Leave blank if you are open anywhere.">
                  <input value={locationsText} onChange={(event) => setLocationsText(event.target.value)} className="input" placeholder="Bengaluru, Remote" />
                </Field>
                <Field label="Certifications" hint="Short certificate names, separated by commas." className="md:col-span-2">
                  <input value={certsText} onChange={(event) => setCertsText(event.target.value)} className="input" placeholder="AWS Cloud Practitioner, Google Data Analytics" />
                </Field>
              </div>
              {roleChips.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
                  <span className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted-foreground">Role targets</span>
                  {roleChips.map((role) => <span key={role} className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-foreground">{role}</span>)}
                </div>
              )}
            </FormSection>

            <FormSection
              id="experience"
              eyebrow="Track record"
              title="Experience"
              description="Add only roles and responsibilities that are genuinely yours."
              action={<button type="button" onClick={addExperience} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[11px] font-semibold text-foreground transition-colors hover:border-border-strong hover:bg-accent/60"><Plus className="h-3.5 w-3.5" />Add role</button>}
            >
              {profile.experience.length ? (
                <div className="space-y-3">
                  {profile.experience.map((item, index) => (
                    <div key={index} className="rounded-xl border border-border bg-muted/15 p-3.5">
                      <div className="mb-2.5 flex items-center justify-between font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground">
                        Experience {index + 1}
                        <button type="button" onClick={() => update('experience', profile.experience.filter((_, i) => i !== index))} title="Remove role" className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive-soft hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                      <div className="grid gap-3 md:grid-cols-3">
                        <input value={item.title} onChange={(event) => update('experience', profile.experience.map((value, i) => i === index ? { ...value, title: event.target.value } : value))} className="input" placeholder="Role title" />
                        <input value={item.company} onChange={(event) => update('experience', profile.experience.map((value, i) => i === index ? { ...value, company: event.target.value } : value))} className="input" placeholder="Company" />
                        <input value={item.period} onChange={(event) => update('experience', profile.experience.map((value, i) => i === index ? { ...value, period: event.target.value } : value))} className="input" placeholder="Dates" />
                        <textarea rows={3} value={item.description} onChange={(event) => update('experience', profile.experience.map((value, i) => i === index ? { ...value, description: event.target.value } : value))} className="input h-auto md:col-span-3" placeholder="Responsibilities and outcomes" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-border bg-muted/15 p-4 text-[11.5px] leading-relaxed text-muted-foreground">No experience added. For an early-career profile, projects are the strongest substitute.</p>
              )}
            </FormSection>

            <FormSection
              id="projects"
              eyebrow="Proof of work"
              title="Projects"
              description="Project details help explain why your skills fit a role."
              action={<button type="button" onClick={addProject} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[11px] font-semibold text-foreground transition-colors hover:border-border-strong hover:bg-accent/60"><Plus className="h-3.5 w-3.5" />Add project</button>}
            >
              {profile.projects.length ? (
                <div className="space-y-3">
                  {profile.projects.map((item, index) => (
                    <div key={index} className="rounded-xl border border-border bg-muted/15 p-3.5">
                      <div className="mb-2.5 flex items-center justify-between font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground">
                        Project {index + 1}
                        <button type="button" onClick={() => update('projects', profile.projects.filter((_, i) => i !== index))} title="Remove project" className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive-soft hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <input value={item.name} onChange={(event) => update('projects', profile.projects.map((value, i) => i === index ? { ...value, name: event.target.value } : value))} className="input" placeholder="Project name" />
                        <input value={item.technologies.join(', ')} onChange={(event) => update('projects', profile.projects.map((value, i) => i === index ? { ...value, technologies: splitList(event.target.value) } : value))} className="input" placeholder="Technologies" />
                        <textarea rows={3} value={item.description} onChange={(event) => update('projects', profile.projects.map((value, i) => i === index ? { ...value, description: event.target.value } : value))} className="input h-auto md:col-span-2" placeholder="What you built and your contribution" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-border bg-muted/15 p-4 text-[11.5px] leading-relaxed text-muted-foreground">Add one or two projects to improve recommendations and resume drafts.</p>
              )}
            </FormSection>

            {profile.resume_filename && <p className="px-1 text-[10.5px] text-muted-foreground">Last reviewed source filename: {profile.resume_filename}</p>}

            <div className="sticky bottom-20 z-20 flex flex-col gap-3 rounded-xl border border-border bg-surface/95 p-3 shadow-pop backdrop-blur sm:flex-row sm:items-center sm:justify-between md:bottom-3">
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground"><UserRoundCheck className="h-4 w-4 text-success" />Saving confirms you reviewed these profile facts.</div>
              <button disabled={saveMutation.isLoading} className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-5 text-[12.5px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50">
                {saveMutation.isLoading ? 'Saving…' : 'Review & save profile'}
              </button>
            </div>
          </form>

          <section id="account" className="scroll-mt-20 rounded-2xl border border-destructive/25 bg-surface p-4 shadow-sm sm:p-5">
            <h2 className="text-[14px] font-semibold text-destructive">Account and privacy</h2>
            <p className="mt-1 max-w-2xl text-[11.5px] leading-relaxed text-muted-foreground">
              You can remove your candidate profile, resume-derived fields, applications, status history, feedback and saved documents at any time. Your password is required to confirm deletion.
            </p>
            <button
              type="button"
              onClick={() => { deleteMutation.reset(); setDeletePassword(''); setDeleteOpen(true); }}
              className="mt-3 rounded-lg border border-destructive/35 px-3 py-2 text-[11.5px] font-semibold text-destructive transition-colors hover:bg-destructive-soft"
            >
              Delete my account
            </button>
          </section>
        </div>
      </div>

      {deleteOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="delete-account-title" onMouseDown={(event) => { if (event.target === event.currentTarget && !deleteMutation.isLoading) setDeleteOpen(false); }}>
          <form onSubmit={(event) => { event.preventDefault(); deleteMutation.mutate(); }} className="card w-full max-w-md p-5">
            <h2 id="delete-account-title" className="text-[14px] font-semibold text-destructive">Delete candidate account?</h2>
            <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">This permanently removes your candidate data and signs you out. Enter your account password to continue.</p>
            <label className="mt-4 block"><span className="label">Password</span><input type="password" required autoComplete="current-password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} className="input" /></label>
            {deleteMutation.error && <p className="mt-2 text-[11.5px] text-destructive">{(deleteMutation.error as Error).message}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" disabled={deleteMutation.isLoading} onClick={() => setDeleteOpen(false)} className="rounded-lg border border-border px-3 py-2 text-[11.5px] font-medium text-foreground transition-colors hover:border-border-strong hover:bg-accent/60">Cancel</button>
              <button disabled={deleteMutation.isLoading} className="rounded-lg bg-destructive px-3 py-2 text-[11.5px] font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50">{deleteMutation.isLoading ? 'Deleting…' : 'Delete account'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default Profile;
