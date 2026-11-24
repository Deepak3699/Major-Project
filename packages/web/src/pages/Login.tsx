import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { AuthShell } from '@/components/AuthShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertCircle, ArrowRight, Lock, Mail, ShieldCheck, User } from 'lucide-react';
import { cn } from '@/components/ui/cn';

type UserRole = 'admin' | 'user';

const ROLES: Array<{ value: UserRole; label: string; hint: string; icon: React.ElementType }> = [
  { value: 'admin', label: 'Admin', hint: 'All leads, keys & settings', icon: ShieldCheck },
  { value: 'user', label: 'User', hint: 'Job search & applications', icon: User },
];

const Login: React.FC = () => {
  const { login } = useAuthStore();
  const [role, setRole] = useState<UserRole>('admin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRoleSelect = (newRole: UserRole) => {
    setRole(newRole);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(email, password, role);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Welcome to HireGen"
      subtitle="Sign in to your workspace"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Role selector */}
        <div className="space-y-2">
          <p className="eyebrow" id="login-role-label">Role</p>
          <div
            className="grid grid-cols-2 gap-2.5"
            role="group"
            aria-labelledby="login-role-label"
          >
            {ROLES.map(({ value, label, hint, icon: Icon }) => {
              const selected = role === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => handleRoleSelect(value)}
                  aria-pressed={selected}
                  className={cn(
                    'flex flex-col items-start gap-0.5 rounded-lg border p-3 text-left transition-colors duration-150',
                    selected
                      ? 'border-signal/40 text-foreground'
                      : 'border-border text-muted-foreground hover:border-border-strong'
                  )}
                >
                  <span className="flex w-full items-center justify-between">
                    <Icon
                      className={cn('h-4 w-4', selected ? 'text-signal' : 'text-muted-foreground')}
                      strokeWidth={1.75}
                    />
                    {selected && (
                      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-signal" />
                    )}
                  </span>
                  <span className="pt-1 text-[13px] font-semibold">{label}</span>
                  <span className="text-[11px] leading-tight text-muted-foreground">{hint}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Email */}
        <div className="space-y-1.5">
          <label htmlFor="email" className="label">
            Email address
          </label>
          <Input
            id="email"
            type="email"
            icon={<Mail />}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={role === 'admin' ? 'admin@example.com' : 'user@company.com'}
            required
            autoComplete="email"
          />
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <label htmlFor="password" className="label">
            Password
          </label>
          <Input
            id="password"
            type="password"
            icon={<Lock />}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete="current-password"
          />
        </div>

        {/* Error message */}
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-lg border border-destructive/25 bg-destructive-soft px-3 py-2.5 text-[13px] text-destructive"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Submit */}
        <Button type="submit" size="lg" className="w-full" loading={loading}>
          {loading ? 'Signing in…' : `Sign in as ${role === 'admin' ? 'admin' : 'user'}`}
          {!loading && <ArrowRight className="h-4 w-4" />}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{' '}
        <Link
          to="/register"
          className="font-medium text-foreground underline-offset-4 transition-colors hover:underline hover:decoration-signal"
        >
          Create one
        </Link>
      </p>
    </AuthShell>
  );
};

export default Login;
