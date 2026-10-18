type Profile = Record<string, any>;
type Job = Record<string, any>;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

function fallbackDocuments(profile: Profile, job: Job) {
  const experiences = Array.isArray(profile.experience) ? profile.experience : [];
  const projects = Array.isArray(profile.projects) ? profile.projects : [];
  const skills = asList(profile.skills);
  const sections = [
    `# ${text(profile.full_name) || 'Candidate'}`,
    [text(profile.headline), text(profile.location)].filter(Boolean).join(' | '),
    text(profile.summary),
    skills.length ? `## Skills\n${skills.join(' · ')}` : '',
    experiences.length ? `## Experience\n${experiences.map((item: any) => `### ${text(item.title)}${item.company ? ` · ${text(item.company)}` : ''}\n${text(item.period)}\n${text(item.description)}`).filter((item: string) => item.replace(/[#\s]/g, '').length > 0).join('\n\n')}` : '',
    projects.length ? `## Projects\n${projects.map((item: any) => `### ${text(item.name)}\n${text(item.description)}${asList(item.technologies).length ? `\nTechnologies: ${asList(item.technologies).join(', ')}` : ''}`).filter((item: string) => item.replace(/[#\s]/g, '').length > 0).join('\n\n')}` : '',
    text(profile.education_level) ? `## Education\n${text(profile.education_level)}` : '',
  ].filter(Boolean);
  const company = text(job.company_name) || 'the hiring team';
  const role = text(job.title) || 'the role';
  const email = [
    `Subject: Application for ${role} at ${company}`,
    '',
    `Hello ${company} Hiring Team,`,
    '',
    `I am interested in the ${role} opportunity at ${company}. My background includes ${skills.slice(0, 4).join(', ') || 'the experience described in my profile'}.`,
    text(profile.summary) ? `\n${text(profile.summary)}` : '',
    '',
    'I would be glad to discuss how my experience and projects relate to the role. I have attached my resume for your consideration.',
    '',
    `Regards,\n${text(profile.full_name) || 'Candidate'}`,
  ].filter(Boolean).join('\n');
  return { tailored_resume: sections.join('\n\n'), email_draft: email, generated_by: 'truthful-template' };
}

export async function prepareApplicationDocuments(profile: Profile, job: Job) {
  const fallback = fallbackDocuments(profile, job);
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fallback;

  const sourceFacts = {
    candidate: {
      full_name: profile.full_name,
      headline: profile.headline,
      location: profile.location,
      summary: profile.summary,
      skills: profile.skills,
      experience_years: profile.experience_years,
      education_level: profile.education_level,
      experience: profile.experience,
      projects: profile.projects,
      certifications: profile.certifications,
    },
    job: {
      title: job.title,
      company: job.company_name,
      description: job.description || job.about_job,
      location: job.location,
      skills: job.skills,
      apply_url: job.apply_url || job.job_url,
    },
  };

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: [
          'Prepare truthful application materials for this candidate and job.',
          'Use only facts explicitly present in the supplied candidate profile. Never invent skills, employers, degrees, dates, achievements, metrics, certifications, or experience.',
          'Reorder and emphasize existing facts to fit the job. If information is absent, omit it. Keep the email professional and concise.',
          'Return JSON with exactly these string keys: tailored_resume and email_draft.',
          JSON.stringify(sourceFacts),
        ].join('\n\n') }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
      }),
    });
    if (!response.ok) return fallback;
    const payload: any = await response.json();
    const generatedText = payload?.candidates?.[0]?.content?.parts?.map((part: any) => part.text || '').join('') || '';
    const parsed = JSON.parse(generatedText);
    if (typeof parsed.tailored_resume !== 'string' || typeof parsed.email_draft !== 'string') return fallback;
    return {
      tailored_resume: parsed.tailored_resume.slice(0, 40_000),
      email_draft: parsed.email_draft.slice(0, 12_000),
      generated_by: 'gemini-2.5-flash',
    };
  } catch {
    return fallback;
  }
}
