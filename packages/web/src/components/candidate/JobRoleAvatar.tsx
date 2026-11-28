import React from 'react';
import {
  BarChart3, BrainCircuit, BriefcaseBusiness, Cloud, Code2, Database, GraduationCap,
  HeartPulse, Megaphone, Palette, PenTool, ShieldCheck, Sparkles, Users, Wrench,
} from 'lucide-react';
import { cn } from '@/components/ui/cn';

interface RoleTheme {
  icon: React.ComponentType<{ size?: number | string; strokeWidth?: number; style?: React.CSSProperties; className?: string }>;
  label: string;
  /** Restrained, ink-like accent used for the icon and the card's top rule. */
  color: string;
}

const THEMES: Record<string, RoleTheme> = {
  ai: { icon: BrainCircuit, label: 'AI and machine learning', color: '#6d4a86' },
  data: { icon: Database, label: 'Data and analytics', color: '#3f6b86' },
  engineering: { icon: Code2, label: 'Software engineering', color: '#3d7a6e' },
  design: { icon: Palette, label: 'Design', color: '#9c5564' },
  product: { icon: BriefcaseBusiness, label: 'Product and operations', color: '#9a6b38' },
  marketing: { icon: Megaphone, label: 'Marketing and growth', color: '#a35c3d' },
  people: { icon: Users, label: 'People and recruiting', color: '#537a52' },
  finance: { icon: BarChart3, label: 'Finance', color: '#3d6f86' },
  health: { icon: HeartPulse, label: 'Healthcare', color: '#9b4f52' },
  security: { icon: ShieldCheck, label: 'Security', color: '#5a5c8c' },
  cloud: { icon: Cloud, label: 'Cloud and infrastructure', color: '#437c8a' },
  education: { icon: GraduationCap, label: 'Teaching and education', color: '#6d5c93' },
  writing: { icon: PenTool, label: 'Writing and content', color: '#8c5273' },
  trades: { icon: Wrench, label: 'Engineering and field work', color: '#80623c' },
  default: { icon: Sparkles, label: 'Opportunity', color: '#8c5a42' },
};

const RULES: Array<{ key: keyof typeof THEMES; pattern: RegExp }> = [
  { key: 'ai', pattern: /machine learning|\bml\b|\bai\b|artificial intelligence|data scien|deep learning|\bnlp\b|computer vision|generative|transformer/i },
  { key: 'security', pattern: /security|cyber|penetration|threat|infosec|firewall/i },
  { key: 'data', pattern: /data engineer|data analyst|analytics|database|\betl\b|spark|airflow|business intelligence|fraud/i },
  { key: 'design', pattern: /design|ux|ui\b|figma|creative|graphic|illustrat/i },
  { key: 'cloud', pattern: /cloud|devops|sre|platform|infrastructure|kubernetes|docker|network/i },
  { key: 'engineering', pattern: /engineer|developer|software|backend|front.?end|full.?stack|programmer|\bqa\b|testing|automation|technical/i },
  { key: 'product', pattern: /product|program manager|operations|project manager|manager|strategy|consultant/i },
  { key: 'marketing', pattern: /marketing|growth|sales|content|copywriter|seo|sem|brand|partnership/i },
  { key: 'people', pattern: /recruit|talent|human resources|\bhr\b|people|onboarding/i },
  { key: 'finance', pattern: /finance|account|audit|banking|tax|payroll|investment|credit/i },
  { key: 'health', pattern: /nurse|doctor|clinical|medical|health|pharma|patient/i },
  { key: 'education', pattern: /teacher|teach|curriculum|trainer|faculty|education|instructor/i },
  { key: 'writing', pattern: /writer|writing|editor|documentation|technical writer/i },
  { key: 'trades', pattern: /mechanic|electric|manufactur|field|maintenance|construction|safety/i },
];

export function getRoleTheme(title?: string | null, industry?: string | null, skills?: string[] | null): RoleTheme {
  const text = `${title || ''} ${industry || ''} ${(skills || []).join(' ')}`;
  const match = RULES.find((rule) => rule.pattern.test(text));
  return match ? THEMES[match.key] : THEMES.default;
}

export interface JobRoleAvatarProps {
  title?: string | null;
  industry?: string | null;
  skills?: string[] | null;
  size?: number;
  className?: string;
}

/**
 * A quiet, ink-toned role mark. The icon still tells you what kind of role it
 * is, but without the bright gradients and blobs that made earlier cards feel
 * playful rather than professional.
 */
export function JobRoleAvatar({ title, industry, skills, size = 36, className }: JobRoleAvatarProps) {
  const theme = getRoleTheme(title, industry, skills);
  const Icon = theme.icon;
  return (
    <span
      role="img"
      aria-label={`${theme.label} role icon`}
      className={cn('grid shrink-0 place-items-center rounded-xl border border-border/70 bg-muted/45', className)}
      style={{ width: size, height: size }}
    >
      <Icon size={Math.round(size * 0.5)} strokeWidth={1.8} style={{ color: theme.color }} />
    </span>
  );
}
