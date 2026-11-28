import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery } from 'react-query';
import { ArrowUpRight, BriefcaseBusiness, Building2, ExternalLink, Mail, Phone } from 'lucide-react';
import { candidate } from '@/lib/api';
import { safeExternalUrl } from '@/lib/safe-url';
import { PageLoader } from '@/components/ui/spinner';

const EASE = [0.22, 1, 0.36, 1] as const;

/** The employer-channel directory, embedded in Discover jobs as a sub-view. */
export function EmployerContactsPanel() {
  const { data, isLoading, error } = useQuery('candidate-contacts', candidate.contacts);
  const entries = data?.data || [];

  return (
    <div className="space-y-4">
      <p className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-[12px] leading-relaxed text-muted-foreground">
        Private phone numbers and inferred personal emails are never shown here. Named hiring contacts appear only when their public company source was directly verified.
      </p>
      {isLoading ? (
        <PageLoader label="Loading employer channels…" />
      ) : error ? (
        <div className="card p-5 text-[13px] text-destructive">{(error as Error).message}</div>
      ) : entries.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {entries.map((contact: any, i: number) => {
            const website = safeExternalUrl(contact.company_website);
            const apply = safeExternalUrl(contact.apply_url || contact.job_url);
            const linkedin = safeExternalUrl(contact.public_hr_linkedin);
            const source = safeExternalUrl(contact.public_hr_source);
            return (
              <motion.article key={contact.job_id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE, delay: Math.min(i * 0.04, 0.24) }} className="rounded-2xl border border-border bg-surface p-5 shadow-sm transition-colors hover:border-border-strong">
                <div className="flex items-start gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-dashed border-border-strong text-muted-foreground"><Building2 className="h-4 w-4" strokeWidth={1.75} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11.5px] text-muted-foreground">{contact.company_name}{contact.location ? ` · ${contact.location}` : ''}</p>
                    <h2 className="mt-0.5 truncate text-[15px] font-semibold tracking-[-0.01em] text-foreground">{contact.job_title}</h2>
                  </div>
                  <span className="inline-flex shrink-0 items-center rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-[10.5px] tabular-nums text-muted-foreground">Quality {contact.trust_score ?? 0}%</span>
                </div>
                <div className="mt-4 space-y-2.5 border-t border-border pt-4">
                  {contact.public_hr_name && <p className="text-[12.5px] font-medium text-foreground">{contact.public_hr_name}<span className="ml-2 text-[11px] font-normal text-muted-foreground">Public hiring contact</span></p>}
                  {contact.company_email && <a className="inline-flex items-center gap-2 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground hover:underline hover:underline-offset-4" href={`mailto:${contact.company_email}`}><Mail className="h-3.5 w-3.5 shrink-0" />{contact.company_email}</a>}
                  {contact.company_phone && <a className="inline-flex items-center gap-2 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground hover:underline hover:underline-offset-4" href={`tel:${contact.company_phone}`}><Phone className="h-3.5 w-3.5 shrink-0" /><span className="font-mono tabular-nums">{contact.company_phone}</span></a>}
                  {!contact.public_hr_name && !contact.company_email && !contact.company_phone && <p className="text-[11.5px] leading-relaxed text-muted-foreground">The listing does not provide a verified named hiring contact. Use the employer's official application page.</p>}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {apply && <a href={apply} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-[11.5px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover">Open job listing <ArrowUpRight className="h-3.5 w-3.5" /></a>}
                  {website && <a href={website} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-[11.5px] font-medium text-foreground transition-colors hover:border-border-strong hover:bg-accent/60">Company site <ExternalLink className="h-3 w-3 text-muted-foreground" /></a>}
                  {linkedin && <a href={linkedin} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-[11.5px] font-medium text-foreground transition-colors hover:border-border-strong hover:bg-accent/60">Hiring profile <ExternalLink className="h-3 w-3 text-muted-foreground" /></a>}
                  {source && <a href={source} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-[11.5px] font-medium text-foreground transition-colors hover:border-border-strong hover:bg-accent/60">Contact source <ExternalLink className="h-3 w-3 text-muted-foreground" /></a>}
                  <Link to={`/jobs/${contact.job_id}`} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-[11.5px] font-medium text-foreground transition-colors hover:border-border-strong hover:bg-accent/60"><BriefcaseBusiness className="h-3.5 w-3.5 text-muted-foreground" />Job details</Link>
                </div>
              </motion.article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-surface px-6 py-14 text-center shadow-sm">
          <span className="mx-auto grid h-11 w-11 place-items-center rounded-lg border border-dashed border-border-strong"><Building2 className="h-[18px] w-[18px] text-muted-foreground" strokeWidth={1.75} /></span>
          <h2 className="mt-2 text-[14px] font-semibold text-foreground">No published employer channels yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-[12.5px] leading-relaxed text-muted-foreground">When qualified roles are published, their official company and application channels will appear here.</p>
        </div>
      )}
    </div>
  );
}
