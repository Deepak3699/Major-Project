import React from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { EmployerContactsPanel } from '@/components/candidate/EmployerContactsPanel';

// Legacy standalone route. Employer contacts now live as a sub-view of
// Discover jobs; this page remains for saved links and external navigation.
const CandidateContacts: React.FC = () => (
  <div className="space-y-4">
    <PageHeader title="Employer contacts" description="Public company channels and hiring links attached to published job listings." />
    <EmployerContactsPanel />
  </div>
);

export default CandidateContacts;
