import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { AuthShell } from '@/components/AuthShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertCircle, ArrowRight, Lock, Mail, ShieldCheck, User, Sparkles } from 'lucide-react';
import { cn } from '@/components/ui/cn';

type UserRole = 'admin' | 'user';

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

  const fillDemoAdmin = () => {
    setRole('admin');
    setEmail('admin@example.com');
    setPassword('change-me-please-32');
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
      title="Welcome to Hiregen"
      subtitle="Select your role and sign in to access your workspace"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Role Selector Tabs */}
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Select Role to Login
          </label>
          <div className="grid grid-cols-2 gap-2.5">
            {/* Admin Option */}
            <button
              type="button"
              onClick={() => handleRoleSelect('admin')}
              className={cn(
                "relative flex flex-col items-start gap-1 p-3 rounded-xl border text-left transition-all duration-200",
                role === 'admin'
                  ? "border-primary bg-primary/10 shadow-sm shadow-primary/20 ring-1 ring-primary/40 text-foreground"
                  : "border-border/70 bg-surface/50 hover:border-border hover:bg-surface text-muted-foreground"
              )}
            >
              <div className="flex w-full items-center justify-between">
                <div className={cn(
                  "p-1.5 rounded-lg transition-colors",
                  role === 'admin' ? "bg-primary text-white" : "bg-muted text-muted-foreground"
                )}>
                  <ShieldCheck className="h-4 w-4" />
                </div>
                {role === 'admin' && (
                  <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse" />
                )}
              </div>
              <p className="mt-1 font-semibold text-sm text-foreground">Admin</p>
              <p className="text-[11px] leading-tight text-muted-foreground">
                All leads, keys & settings
              </p>
            </button>

            {/* Candidate and other non-admin accounts */}
            <button
              type="button"
              onClick={() => handleRoleSelect('user')}
              className={cn(
                "relative flex flex-col items-start gap-1 p-3 rounded-xl border text-left transition-all duration-200",
                role === 'user'
                  ? "border-primary bg-primary/10 shadow-sm shadow-primary/20 ring-1 ring-primary/40 text-foreground"
                  : "border-border/70 bg-surface/50 hover:border-border hover:bg-surface text-muted-foreground"
              )}
            >
              <div className="flex w-full items-center justify-between">
                <div className={cn(
                  "p-1.5 rounded-lg transition-colors",
                  role === 'user' ? "bg-primary text-white" : "bg-muted text-muted-foreground"
                )}>
                  <User className="h-4 w-4" />
                </div>
                {role === 'user' && (
                  <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse" />
                )}
              </div>
              <p className="mt-1 font-semibold text-sm text-foreground">User</p>
              <p className="text-[11px] leading-tight text-muted-foreground">Job search & applications</p>
            </button>
          </div>

          {/* Quick Demo Credentials Helper */}
          {role === 'admin' && (
            <div className="flex items-center justify-between px-1 pt-1 text-xs">
              <span className="text-muted-foreground">Need quick admin login?</span>
              <button
                type="button"
                onClick={fillDemoAdmin}
                className="inline-flex items-center gap-1 font-semibold text-primary hover:underline hover:text-primary-hover"
              >
                <Sparkles className="h-3 w-3" /> Auto-fill Demo Admin
              </button>
            </div>
          )}
        </div>

        {/* Email Input */}
        <div className="space-y-1.5">
          <label htmlFor="email" className="label">
            Email address
          </label>
          <Input
            id="email"
            type="email"
            icon={<Mail className="h-4 w-4" />}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={role === 'admin' ? "admin@example.com" : "user@company.com"}
            required
            autoComplete="email"
          />
        </div>

        {/* Password Input */}
        <div className="space-y-1.5">
          <label htmlFor="password" className="label">
            Password
          </label>
          <Input
            id="password"
            type="password"
            icon={<Lock className="h-4 w-4" />}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete="current-password"
          />
        </div>

        {/* Error message alert */}
        {error && (
          <div className="flex items-start gap-2.5 rounded-lg border border-destructive/25 bg-destructive-soft px-3 py-2.5 text-[13px] text-destructive animate-fade-in">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Submit Button */}
        <Button type="submit" className="w-full" loading={loading} size="lg">
          {loading ? 'Authenticating…' : `Sign In as ${role === 'admin' ? 'Admin' : 'User'}`}
          {!loading && <ArrowRight className="h-4 w-4" />}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{' '}
        <Link
          to="/register"
          className="font-medium text-primary transition-colors hover:text-primary-hover"
        >
          Create one
        </Link>
      </p>
    </AuthShell>
  );
};

export default Login;
