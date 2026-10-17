// PII masking for anything that reaches logs / audit rows / analytics.
// Mirrors packages/scrapers/scrapers/utils/redact.py so both stacks agree.

export function redactEmail(email: string | null | undefined): string {
  if (!email) return '<none>';
  const e = String(email).trim();
  if (!e.includes('@')) return (e[0] ?? '') + '***';
  const [local, ...rest] = e.split('@');
  const domain = rest.join('@');
  const head = local ? local[0] : '';
  const tld = domain.includes('.') ? domain.split('.').pop() : domain;
  return `${head || '***'}***@***.${tld}`;
}

export function redactPhone(phone: string | null | undefined): string {
  if (!phone) return '<none>';
  const s = String(phone).replace(/[^0-9+]/g, '');
  const digits = s.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  const plus = s.startsWith('+') ? '+' : '';
  return `${plus}***${digits.slice(-2)}`;
}
