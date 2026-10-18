import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from 'react-query';
import { Download, FileText, LayoutTemplate, LoaderCircle } from 'lucide-react';
import { candidate } from '@/lib/api';
import { CandidateJob, CandidateProfile } from '@/lib/types';
import { PageHeader } from '@/components/ui/page-header';
import { PageLoader } from '@/components/ui/spinner';

type Template = 'classic' | 'modern' | 'compact';
const templates: Array<{ id: Template; name: string; note: string }> = [
  { id: 'classic', name: 'Classic', note: 'Clean single-column layout' },
  { id: 'modern', name: 'Modern', note: 'Strong heading and clear sections' },
  { id: 'compact', name: 'Compact', note: 'Two-column layout for more detail' },
];

function profileDraft(profile: CandidateProfile): string {
  const skills = Array.isArray(profile.skills) ? profile.skills : [];
  const experience = Array.isArray(profile.experience) ? profile.experience : [];
  const projects = Array.isArray(profile.projects) ? profile.projects : [];
  const certifications = Array.isArray(profile.certifications) ? profile.certifications : [];
  return [
    `# ${profile.full_name}`,
    profile.summary ? `## Summary\n${profile.summary}` : '',
    skills.length ? `## Skills\n${skills.join(' · ')}` : '',
    experience.length ? `## Experience\n${experience.map((item) => `### ${item.title}${item.company ? ` · ${item.company}` : ''}\n${item.period}\n${item.description}`).join('\n\n')}` : '',
    projects.length ? `## Projects\n${projects.map((item) => `### ${item.name}\n${item.description}\nTechnologies: ${(Array.isArray(item.technologies) ? item.technologies : []).join(', ')}`).join('\n\n')}` : '',
    profile.education_level ? `## Education\n${profile.education_level}` : '',
    certifications.length ? `## Certifications\n${certifications.join('\n')}` : '',
  ].filter(Boolean).join('\n\n');
}

function parseDraft(content: string) {
  const sections: Array<{ title: string; lines: string[] }> = [];
  let current = { title: 'Profile', lines: [] as string[] };
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) { if (current.lines.length && current.lines[current.lines.length - 1] !== '') current.lines.push(''); continue; }
    const heading = line.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      if (current.lines.length) sections.push(current);
      const title = heading[1].trim();
      current = { title: sections.length === 0 && title.toLowerCase() === 'summary' ? 'Summary' : title, lines: [] };
      if (sections.length === 0 && title.toLowerCase() === 'summary') sections.push({ title: 'Summary', lines: [] });
      continue;
    }
    current.lines.push(line.replace(/^[-•*]\s*/, '• '));
  }
  if (current.lines.length) sections.push(current);
  return sections.filter((section) => section.lines.some((line) => line.trim()));
}

const ResumeStudio: React.FC = () => {
  const [searchParams] = useSearchParams();
  const profileQuery = useQuery('candidate-profile', candidate.profile);
  const jobsQuery = useQuery(['candidate-resume-jobs'], () => candidate.jobs({ days: 90, page: 1, limit: 50 }));
  const profile = profileQuery.data?.profile as CandidateProfile | null | undefined;
  const jobs: CandidateJob[] = Array.isArray(jobsQuery.data?.data) ? jobsQuery.data.data : [];
  const [jobId, setJobId] = useState(searchParams.get('jobId') || '');
  const [template, setTemplate] = useState<Template>('modern');
  const [draft, setDraft] = useState('');
  const [sourceLabel, setSourceLabel] = useState('Profile facts');
  const [notice, setNotice] = useState('');
  const selectedJob = jobs.find((job) => job.id === jobId);

  React.useEffect(() => {
    if (!jobId && jobs.length) setJobId(searchParams.get('jobId') || jobs[0].id);
  }, [jobId, jobs, searchParams]);
  React.useEffect(() => {
    if (profile && !draft) setDraft(profileDraft(profile));
  }, [profile, draft]);

  const generation = useMutation((id: string) => candidate.prepare(id), {
    onSuccess: (result) => {
      const documents = Array.isArray(result?.documents) ? result.documents : [];
      const resume = documents.find((document) => document.document_type === 'tailored_resume');
      if (resume?.content) setDraft(resume.content);
      setSourceLabel(result.generated_by === 'gemini-2.5-flash' ? 'Gemini draft · review every fact' : 'Local profile draft');
      setNotice('Draft is ready. Check every detail and edit anything you want before saving it as PDF.');
    },
    onError: (error) => setNotice((error as Error).message),
  });

  const sections = useMemo(() => parseDraft(draft || (profile ? profileDraft(profile) : '')), [draft, profile]);
  if (profileQuery.isLoading) return <PageLoader label="Loading resume workspace…" />;
  if (profileQuery.error) return <div className="card p-5 text-sm text-destructive">{(profileQuery.error as Error).message}</div>;
  if (!profile) return <div className="card p-8 text-center"><FileText className="mx-auto h-8 w-8 text-primary" /><h2 className="mt-3 font-semibold">Add your profile first</h2><p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Your resume is built from the experience, skills, education and projects you confirm.</p><Link to="/profile" className="mt-4 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Open profile</Link></div>;

  return <div className="resume-studio space-y-5">
    <div className="resume-hide"><PageHeader title="Resume studio" description="Choose a fixed layout, tailor the content to a role, review it, then save a PDF." /></div>
    <section className="resume-hide card space-y-4 p-4 sm:p-5">
      <div className="grid gap-3 md:grid-cols-[1fr_auto]"><label><span className="label">Target role</span><select value={selectedJob?.id || ''} onChange={(event) => setJobId(event.target.value)} className="input"><option value="">Build from my profile</option>{jobs.map((job: CandidateJob) => <option key={job.id} value={job.id}>{job.title} · {job.company_name}</option>)}</select></label><button disabled={!selectedJob || generation.isLoading} onClick={() => selectedJob && generation.mutate(selectedJob.id)} className="mt-auto inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{generation.isLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}{generation.isLoading ? 'Preparing draft…' : 'Tailor to this job'}</button></div>
      {jobsQuery.isError && <p className="text-xs text-warning">Recent jobs could not be loaded. You can still build and export a resume from your profile.</p>}
      <div><div className="mb-2 flex items-center gap-2"><LayoutTemplate className="h-4 w-4 text-muted-foreground" /><span className="label mb-0">Choose a resume template</span></div><div className="grid gap-3 sm:grid-cols-3">{templates.map((item) => <button key={item.id} type="button" aria-pressed={template === item.id} onClick={() => setTemplate(item.id)} className={`rounded-xl border p-3 text-left transition ${template === item.id ? 'border-primary bg-primary-soft ring-2 ring-primary/20' : 'border-border hover:border-primary/40'}`}><span className={`resume-template-thumb resume-thumb-${item.id}`} aria-hidden="true"><i /><i /><i /><i /></span><span className="block text-sm font-semibold">{item.name}</span><span className="mt-1 block text-[11px] text-muted-foreground">{item.note}</span></button>)}</div></div>
      <label className="block"><span className="label">Review and edit resume content</span><textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={8} maxLength={40000} className="input h-auto resize-y font-mono text-xs leading-5" /></label>
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">{sourceLabel}{selectedJob ? ` · for ${selectedJob.title} at ${selectedJob.company_name}` : ''}</p><button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-semibold hover:border-primary/40"><Download className="h-4 w-4" />Save as PDF</button></div>
      {notice && <p className={`text-xs ${generation.error ? 'text-destructive' : 'text-muted-foreground'}`}>{notice}</p>}
      {!selectedJob && !jobsQuery.isError && <p className="text-xs text-muted-foreground">Build from your confirmed profile now, or select a recent job when one is available.</p>}
    </section>

      <article className={`resume-page resume-template-${template}`} aria-label={`${template} resume preview`}>
      <header className="resume-heading"><h1>{profile.full_name || 'Your name'}</h1><p className="resume-headline">{profile.headline || selectedJob?.title || 'Professional profile'}</p><p className="resume-contact">{[profile.contact_email, profile.phone, profile.location].filter(Boolean).join(' · ')}</p>{selectedJob && <p className="resume-target">Prepared for {selectedJob.title} · {selectedJob.company_name}</p>}</header>
      <div className="resume-content">{sections.length ? sections.map((section, index) => <section className="resume-section" key={`${section.title}-${index}`}><h2>{section.title.replace(/^#+\s*/, '')}</h2><div>{section.lines.map((line, lineIndex) => line ? <p key={lineIndex}>{line}</p> : <div key={lineIndex} className="resume-gap" />)}</div></section>) : <p>Add profile details or generate a role-specific draft to preview your resume.</p>}</div>
    </article>
  </div>;
};

export default ResumeStudio;
