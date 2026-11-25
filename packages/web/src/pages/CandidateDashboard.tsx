import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from 'react-query';
import {
  ArrowRight, Bookmark, BriefcaseBusiness, CalendarDays, CircleCheck, Clock3,
  Compass, FileText, GraduationCap, MapPin, Mic, Search, Sparkles, Star,
  Target, TrendingUp,
} from 'lucide-react';
import { candidate, credits } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { cn } from '@/components/ui/cn';

const EASE = 'transition duration-200 ease-out';

const quickLinks = [
  { label: 'Discover jobs', icon: Search, to: '/jobs', tone: 'terracotta' },
  { label: 'Improve resume', icon: FileText, to: '/resume', tone: 'olive' },
  { label: 'Get role guidance', icon: Target, to: '/preparation', tone: 'gold' },
  { label: 'Check your chances', icon: TrendingUp, to: '/recommendations', tone: 'olive' },
  { label: 'Start skill prep', icon: GraduationCap, to: '/learning', tone: 'terracotta' },
];

function CareerVisual() {
  return (
    <div aria-hidden className="absolute inset-y-0 right-0 hidden w-[49%] overflow-hidden lg:block">
      <div className="absolute inset-0 bg-[linear-gradient(110deg,rgba(255,246,236,.1),rgba(97,62,42,.08)),linear-gradient(135deg,#f6e4d2_0%,#e7c8ae_47%,#8a7654_100%)]" />
      <div className="absolute -right-6 top-0 h-full w-[78%] bg-[repeating-linear-gradient(90deg,rgba(255,255,255,.55)_0_5px,transparent_5px_35px)] opacity-60" />
      <div className="absolute -right-8 top-0 h-full w-[74%] bg-[linear-gradient(116deg,transparent_0_31%,rgba(255,255,255,.7)_32%_34%,transparent_35%_57%,rgba(255,255,255,.55)_58%_60%,transparent_61%)]" />
      <div className="absolute bottom-0 left-[3%] h-[42%] w-[30%] rounded-t-full bg-[#7a7d50]/55 blur-[2px]" />
      <div className="absolute -bottom-20 right-[-8%] h-[65%] w-[73%] rounded-[48%_48%_0_0] bg-[radial-gradient(ellipse_at_50%_15%,#15120e_0_11%,#30261f_12%_31%,#1e1b17_32%_100%)] shadow-[-22px_-12px_56px_rgba(57,37,25,.32)]" />
      <div className="absolute bottom-[35%] right-[30%] h-[30%] w-[28%] rounded-[50%_50%_46%_44%] bg-[#a16f55] shadow-[inset_-12px_-5px_20px_rgba(42,24,16,.24)]" />
      <div className="absolute bottom-[38%] right-[23%] h-[33%] w-[37%] rounded-[53%_53%_45%_48%] bg-[radial-gradient(ellipse_at_38%_55%,#1e1814_0_11%,#372b23_12%_45%,#171411_46%_100%)]" />
      <div className="absolute bottom-[3%] right-[5%] h-[44%] w-[52%] rounded-t-[50%] border border-white/10 bg-[#201d19]/80" />
      <p className="absolute right-[8%] top-[13%] -rotate-6 font-[Georgia,serif] text-[24px] font-bold italic leading-[1.05] text-[#3f1c10]">Dream.<br />Prepare.<br />Get Hired.</p>
      <div className="absolute -bottom-20 -right-20 h-64 w-64 rounded-full border border-[#f9e4cf]/50" /><div className="absolute bottom-[-35%] right-[12%] h-[23rem] w-[23rem] rounded-full border border-[#f9e4cf]/50" />
    </div>
  );
}

function ProfileRing({ value }: { value: number }) {
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const complete = Math.max(0, Math.min(100, value));
  return <div className="relative grid h-[112px] w-[112px] shrink-0 place-items-center"><svg className="absolute inset-0 -rotate-90" viewBox="0 0 112 112" role="img" aria-label={`Profile strength ${complete} percent`}><circle cx="56" cy="56" r={radius} fill="none" stroke="#f0ddd0" strokeWidth="8" /><circle cx="56" cy="56" r={radius} fill="none" stroke="url(#candidate-profile-ring)" strokeLinecap="round" strokeWidth="8" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - complete / 100)} /><defs><linearGradient id="candidate-profile-ring" x1="0" x2="112" y1="56" y2="56"><stop stopColor="#c2633d" /><stop offset="1" stopColor="#747b59" /></linearGradient></defs></svg><span className="font-[Georgia,serif] text-[29px] font-bold text-[#351d14]">{complete}%</span></div>;
}

function SmallArrow() {
  return <span className="grid h-7 w-7 place-items-center rounded-full bg-[#f3dfd0] text-[#602b19] transition-transform duration-200 group-hover:translate-x-0.5"><ArrowRight className="h-3.5 w-3.5" strokeWidth={2.4} /></span>;
}

function companyMark(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words.map((word) => word[0]).join('').slice(0, 2).toUpperCase() || 'HG';
}

const CandidateDashboard: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const [search, setSearch] = useState('');
  const { data: summary } = useQuery('candidate-summary', candidate.summary, { refetchInterval: 30000 });
  const { data: recommendationResponse } = useQuery('candidate-recommendations', candidate.recommendations, { enabled: !!summary?.has_profile, refetchInterval: 30000 });
  const { data: applicationResponse } = useQuery('candidate-applications', candidate.applications, { refetchInterval: 30000 });
  const { data: creditsData } = useQuery('credits-overview', credits.overview, { refetchInterval: 30000 });

  const firstName = (user?.email?.split('@')[0] || 'there').split(/[._-]/)[0];
  const displayName = firstName.charAt(0).toUpperCase() + firstName.slice(1);
  const completion = Math.round(summary?.profile_completion ?? 0);
  const recommendations = recommendationResponse?.data ?? [];
  const applications = applicationResponse?.data ?? [];
  const creditsAvailable = creditsData?.wallet.balance ?? 0;
  const activeApps = Number(summary?.application_total ?? applications.length);
  const filteredJobs = useMemo(() => {
    const input = search.trim().toLowerCase();
    return input ? recommendations.filter((job) => `${job.title} ${job.company_name} ${job.location ?? ''}`.toLowerCase().includes(input)) : recommendations;
  }, [recommendations, search]);
  const latestActivity = applications.slice(0, 3);
  const completionItems = [
    { label: 'Basic details', complete: completion >= 20 },
    { label: 'Education', complete: completion >= 45 },
    { label: 'Skills', complete: completion >= 65 },
    { label: 'Experience', complete: completion >= 85 },
  ];

  return (
    <div className="space-y-5 pb-4 text-[#351d14]">
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_350px]">
        <div className="relative min-h-[350px] overflow-hidden rounded-[26px] border border-[#ead5c7] bg-[linear-gradient(108deg,#fff7f0_0%,#faeadc_51%,#efd1b9_100%)] p-7 shadow-[0_24px_60px_-42px_rgba(95,43,22,.5)] sm:p-10">
          <CareerVisual />
          <div className="relative z-10 max-w-[53%] min-w-[310px]">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/72 px-3 py-1.5 text-[12px] font-semibold text-[#5b4a28] shadow-sm"><span className="h-2.5 w-2.5 rounded-full bg-[#6f774c]" />Your Career, Our Mission</span>
            <h1 className="mt-4 font-[Georgia,serif] text-[42px] font-bold leading-[.99] tracking-[-.045em] text-[#35170d] sm:text-[55px]">Welcome back,<br /><span className="text-[#bd5b38]">{displayName.toUpperCase()}.</span></h1>
            <p className="mt-4 max-w-[470px] text-[15px] leading-[1.45] text-[#3f271d]">Your next opportunity is closer than it looks. Discover jobs that fit your strengths, prepare with intent, and move forward with confidence.</p>
            <div className="mt-5 flex flex-wrap gap-3"><Link to="/recommendations" className={`group inline-flex h-11 items-center gap-2 rounded-full bg-[#bd5b38] px-5 text-[13px] font-bold text-white shadow-[0_12px_24px_-12px_rgba(120,48,24,.65)] hover:bg-[#ab4a2a] ${EASE}`}>Explore recommended jobs <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></Link><Link to="/profile" className={`inline-flex h-11 items-center gap-2 rounded-full border border-[#a95c3f] bg-white/45 px-5 text-[13px] font-bold text-[#522415] hover:bg-white/80 ${EASE}`}><Sparkles className="h-4 w-4 text-[#be5836]" />Enhance profile</Link></div>
            <div className="mt-4 flex gap-3"><span className="h-2 w-2 rounded-full bg-[#c15d39]" /><span className="h-2 w-2 rounded-full bg-[#d8b09b]" /><span className="h-2 w-2 rounded-full bg-[#d8b09b]" /></div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <section className="relative overflow-hidden rounded-[24px] border border-[#ead5c7] bg-white/70 px-6 py-5 shadow-[0_20px_45px_-36px_rgba(95,43,22,.45)]"><div aria-hidden className="absolute -right-8 -top-8 h-28 w-28 rounded-full border border-[#d79d7d]/25" /><div className="relative flex items-center gap-5"><ProfileRing value={completion} /><div><h2 className="font-[Georgia,serif] text-[18px] font-bold">Profile strength</h2><p className="mt-3 text-[13px] text-[#392216]">{completion >= 85 ? 'Great! You’re on track.' : 'A few details will unlock better matches.'}</p><Link to="/profile" className="mt-4 inline-flex items-center gap-2 text-[13px] font-semibold text-[#bd5b38] underline decoration-[#bd5b38]/35 underline-offset-4">Complete profile <ArrowRight className="h-4 w-4" /></Link></div></div></section>
          <section className="rounded-[24px] border border-[#ead5c7] bg-white/70 px-5 py-5 shadow-[0_20px_45px_-36px_rgba(95,43,22,.45)]"><div className="grid grid-cols-3 divide-x divide-[#ead8ca]">{[{ icon: BriefcaseBusiness, value: summary?.fresh_jobs_7d ?? 0, label: 'Fresh jobs' }, { icon: Star, value: creditsAvailable, label: 'Credits' }, { icon: CalendarDays, value: activeApps ? `${activeApps}` : '0', label: 'Active' }].map(({ icon: Icon, value, label }) => <div key={label} className="grid place-items-center px-2 text-center"><span className="grid h-9 w-9 place-items-center rounded-full bg-[#f5e2d5] text-[#bf5a37]"><Icon className="h-[18px] w-[18px]" strokeWidth={2} /></span><strong className="mt-2 font-[Georgia,serif] text-[23px] leading-none">{value}</strong><span className="mt-1 text-[11px] font-medium text-[#55372a]">{label}</span></div>)}</div></section>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_375px]">
        <div className="rounded-[24px] border border-[#ead5c7] bg-white/62 p-5 shadow-[0_20px_50px_-38px_rgba(95,43,22,.45)] sm:p-6"><div className="flex items-center justify-between"><h2 className="flex items-center gap-3 font-[Georgia,serif] text-[20px] font-bold"><Sparkles className="h-6 w-6 text-[#c05a37]" strokeWidth={1.8} />Quick access</h2><Link to="/jobs" className="group inline-flex items-center gap-2 text-[12px] font-bold text-[#bd5b38]">View all <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></Link></div><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{quickLinks.map(({ label, icon: Icon, to, tone }) => <Link key={label} to={to} className={`group min-h-[124px] rounded-[18px] border border-[#ecd9cc] bg-[linear-gradient(145deg,rgba(255,255,255,.88),rgba(251,237,227,.75))] p-4 hover:-translate-y-1 hover:border-[#d99372] hover:shadow-[0_16px_30px_-19px_rgba(95,43,22,.5)] ${EASE}`}><span className={cn('grid h-11 w-11 place-items-center rounded-2xl', tone === 'olive' ? 'bg-[#e8eadc] text-[#747b59]' : tone === 'gold' ? 'bg-[#f9e8ca] text-[#bc8334]' : 'bg-[#f7e1d4] text-[#c15b37]')}><Icon className="h-5 w-5" strokeWidth={2} /></span><div className="mt-4 flex items-end justify-between gap-1"><p className="max-w-[94px] text-[13px] font-semibold leading-[1.25] text-[#392216]">{label}</p><SmallArrow /></div></Link>)}</div></div>
        <section className="rounded-[24px] border border-[#ead5c7] bg-white/62 p-5 shadow-[0_20px_50px_-38px_rgba(95,43,22,.45)] sm:p-6"><div className="flex items-center justify-between"><h2 className="flex items-center gap-3 font-[Georgia,serif] text-[20px] font-bold"><Clock3 className="h-6 w-6 text-[#6c724e]" strokeWidth={1.9} />Recent activity</h2><Link to="/applications" className="group inline-flex items-center gap-2 text-[12px] font-bold text-[#bd5b38]">View all <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></Link></div>{latestActivity.length ? <ol className="relative mt-5 space-y-5 border-l border-[#e5cabb] pl-6 text-[13px]">{latestActivity.map((application, index) => <li key={application.id} className="relative flex items-start justify-between gap-3"><span className={cn('absolute -left-[31px] top-1 h-3.5 w-3.5 rounded-full border-2 border-[#fff8f2]', index === 0 ? 'bg-[#c05a37]' : index === 1 ? 'bg-[#747b59]' : 'bg-[#efd5c3]')} /><span className="font-medium text-[#3b251b]">{application.job_title} <span className="block text-[11px] font-normal text-[#896859]">{application.company_name} · {application.status.replace(/_/g, ' ')}</span></span><time className="shrink-0 text-[11px] text-[#896859]">{new Date(application.updated_at).toLocaleDateString()}</time></li>)}</ol> : <div className="mt-5 rounded-2xl border border-dashed border-[#dfbda9] bg-[#fff9f5] p-5 text-[13px] text-[#6f4d3d]">Save a role to start tracking your progress.</div>}</section>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="rounded-[24px] border border-[#ead5c7] bg-white/62 p-5 shadow-[0_20px_50px_-38px_rgba(95,43,22,.45)] sm:p-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="flex items-center gap-3 font-[Georgia,serif] text-[21px] font-bold"><Sparkles className="h-6 w-6 text-[#c05a37]" strokeWidth={1.7} />Recommended for you</h2><p className="ml-9 text-[11px] text-[#866657]">Based on your skills and interests</p></div><Link to="/recommendations" className="group inline-flex items-center gap-2 text-[12px] font-bold text-[#bd5b38]">View all <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></Link></div><label className="relative mt-4 block"><Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#825039]" /><input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Filter recommended jobs" placeholder="Search jobs, roles, or companies" className="h-10 w-full rounded-xl border border-[#ead5c7] bg-white/70 pl-11 pr-4 text-[12.5px] outline-none placeholder:text-[#9b7766] focus:border-[#bd5b38] focus:ring-4 focus:ring-[#bd5b38]/10" /></label>{filteredJobs.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{filteredJobs.slice(0, 4).map((job) => <Link to={`/jobs/${job.id}`} key={job.id} className={`group relative rounded-[18px] border border-[#ead9cd] bg-[linear-gradient(145deg,rgba(255,255,255,.88),rgba(251,237,227,.72))] p-4 hover:-translate-y-1 hover:border-[#d99372] hover:shadow-[0_16px_30px_-19px_rgba(95,43,22,.5)] ${EASE}`}><Bookmark className="absolute right-4 top-4 h-4 w-4 text-[#a16e54]" strokeWidth={1.8} /><span className="grid h-7 w-7 place-items-center rounded-lg bg-[#f3e0d3] text-[10px] font-black text-[#aa5032]">{companyMark(job.company_name)}</span><p className="mt-3 truncate text-[13px] font-bold text-[#392216]">{job.title}</p><p className="mt-1 truncate text-[11px] text-[#6f5446]">{job.company_name} · {job.location || 'Flexible'}</p><p className="mt-1 truncate text-[11px] text-[#6f5446]">{job.salary_range || 'Compensation discussed on application'}</p><div className="mt-3 flex items-center justify-between"><span className="rounded-full bg-[#f0dfd2] px-2 py-1 text-[9px] font-semibold text-[#9a4d30]">{job.employment_type || 'Full-time'}</span><SmallArrow /></div></Link>)}</div> : <div className="mt-4 rounded-2xl border border-dashed border-[#dbb7a3] bg-[#fff9f5] px-5 py-7 text-center text-[13px] text-[#765343]">{search ? `No roles match “${search}”.` : 'Complete your profile to unlock recommendations tailored to you.'}<Link to={search ? '/jobs' : '/profile'} className="mt-3 block font-semibold text-[#bd5b38]">{search ? 'Browse all jobs' : 'Complete profile'}</Link></div>}</div>
        <section className="relative overflow-hidden rounded-[24px] border border-[#ead5c7] bg-[linear-gradient(135deg,#f8dcc8,#efd4b8_52%,#d7bd9d)] p-7 shadow-[0_20px_50px_-38px_rgba(95,43,22,.45)]"><div aria-hidden className="absolute -right-9 bottom-[-3rem] h-52 w-52 rounded-full bg-[#68714d]/50 blur-[1px]" /><div aria-hidden className="absolute bottom-1 right-4 h-24 w-36 rounded-t-[50%] border-[10px] border-[#5b3a24] border-b-0 opacity-80" /><div className="relative max-w-[230px]"><TrendingUp className="h-10 w-10 text-[#68714d]" strokeWidth={2.2} /><h2 className="mt-5 font-[Georgia,serif] text-[23px] font-bold leading-[1.02]">Boost your<br />career growth</h2><p className="mt-2 text-[12px] leading-relaxed text-[#533626]">Get personalized guidance and skill recommendations.</p><Link to="/learning" className={`mt-5 inline-flex items-center gap-2 rounded-full bg-[#582a1b] px-4 py-2.5 text-[12px] font-bold text-white hover:bg-[#3f1f14] ${EASE}`}>Explore skills <ArrowRight className="h-4 w-4" /></Link></div></section>
      </section>

      <section className="grid gap-4 rounded-[24px] border border-[#ead5c7] bg-white/55 p-5 sm:grid-cols-[1.1fr_.9fr] sm:p-6"><div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#a05c41]">Application progress</p><h2 className="mt-2 font-[Georgia,serif] text-[21px] font-bold">Move each opportunity forward.</h2><p className="mt-2 max-w-xl text-[13px] leading-relaxed text-[#745445]">Every application stays in one place, so you always know what deserves your next action.</p></div><div className="grid grid-cols-4 gap-2 self-center text-center">{['Applied', 'Interview', 'Offer', 'Joined'].map((stage, index) => <div key={stage}><span className={cn('mx-auto grid h-8 w-8 place-items-center rounded-full border text-[11px] font-bold', index < 2 ? 'border-[#c8633e] bg-[#c8633e] text-white' : 'border-[#dec3b4] bg-white/70 text-[#936854]')}>{index < 2 ? <CircleCheck className="h-4 w-4" /> : index + 1}</span><span className="mt-2 block text-[10px] font-medium text-[#674535]">{stage}</span></div>)}</div></section>
    </div>
  );
};

export default CandidateDashboard;
