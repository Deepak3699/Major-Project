import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from 'react-query';
import { ArrowUpRight, BriefcaseBusiness, Building2, ExternalLink, Mail, Phone } from 'lucide-react';
import { candidate } from '@/lib/api';
import { safeExternalUrl } from '@/lib/safe-url';
import { PageHeader } from '@/components/ui/page-header';
import { PageLoader } from '@/components/ui/spinner';

const CandidateContacts: React.FC = () => {
  const { data, isLoading, error } = useQuery('candidate-contacts', candidate.contacts);
  const entries = data?.data || [];
  return <div className="space-y-5">
    <PageHeader title="Employer contacts" description="Public company channels and hiring links attached to published job listings." />
    <p className="rounded-lg border border-border bg-surface/60 p-3 text-xs leading-5 text-muted-foreground">Private phone numbers and inferred personal emails are never shown here. Named hiring contacts appear only when their public company source was directly verified.</p>
    {isLoading ? <PageLoader label="Loading employer channels…" /> : error ? <div className="card p-5 text-sm text-destructive">{(error as Error).message}</div> : entries.length ? <div className="grid gap-3 lg:grid-cols-2">{entries.map((contact: any) => {
      const website = safeExternalUrl(contact.company_website);
      const apply = safeExternalUrl(contact.apply_url || contact.job_url);
      const linkedin = safeExternalUrl(contact.public_hr_linkedin);
      const source = safeExternalUrl(contact.public_hr_source);
      return <article key={contact.job_id} className="card p-5">
        <div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"><Building2 className="h-5 w-5" /></div><div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">{contact.company_name}{contact.location ? ` · ${contact.location}` : ''}</p><h2 className="mt-1 text-base font-semibold">{contact.job_title}</h2></div><span className="rounded-full border border-border px-2 py-1 text-[10px] text-muted-foreground">Quality {contact.trust_score ?? 0}%</span></div>
        <div className="mt-4 space-y-2 border-t border-border pt-4">
          {contact.public_hr_name && <p className="text-sm font-medium">{contact.public_hr_name}<span className="ml-2 text-[11px] font-normal text-muted-foreground">Public hiring contact</span></p>}
          {contact.company_email && <a className="flex items-center gap-2 text-xs text-primary hover:underline" href={`mailto:${contact.company_email}`}><Mail className="h-3.5 w-3.5" />{contact.company_email}</a>}
          {contact.company_phone && <a className="flex items-center gap-2 text-xs text-primary hover:underline" href={`tel:${contact.company_phone}`}><Phone className="h-3.5 w-3.5" />{contact.company_phone}</a>}
          {!contact.public_hr_name && !contact.company_email && !contact.company_phone && <p className="text-xs text-muted-foreground">The listing does not provide a verified named hiring contact. Use the employer's official application page.</p>}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {apply && <a href={apply} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground">Open job listing <ArrowUpRight className="h-3.5 w-3.5" /></a>}
          {website && <a href={website} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium hover:border-primary/40">Company site <ExternalLink className="h-3.5 w-3.5" /></a>}
          {linkedin && <a href={linkedin} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium hover:border-primary/40">Hiring profile <ExternalLink className="h-3.5 w-3.5" /></a>}
          {source && <a href={source} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium hover:border-primary/40">Contact source <ExternalLink className="h-3.5 w-3.5" /></a>}
          <Link to={`/jobs/${contact.job_id}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium hover:border-primary/40"><BriefcaseBusiness className="h-3.5 w-3.5" />Job details</Link>
        </div>
      </article>;
    })}</div> : <div className="card p-8 text-center"><Building2 className="mx-auto h-8 w-8 text-muted-foreground" /><h2 className="mt-3 font-semibold">No published employer channels yet</h2><p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">When qualified roles are published, their official company and application channels will appear here.</p></div>}
  </div>;
};

export default CandidateContacts;
