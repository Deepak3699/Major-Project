// Jest-side stand-in for src/lib/env.ts (mapped via moduleNameMapper).
// The real module reads Vite's `import.meta.env`, which cannot be compiled to
// CommonJS; tests that need different values mock '@/lib/env' themselves.
export const API_URL = 'http://localhost:3000/api';
export const SSE_URL = '/api';
