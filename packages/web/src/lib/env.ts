// Vite build-time config. This is the ONLY module allowed to touch `import.meta`:
// TypeScript cannot down-level it to CommonJS, so any module importing it directly
// becomes untestable under jest (the suite fails to parse). Importing pages and
// tests read/mock these values instead.
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
export const SSE_URL = import.meta.env.VITE_SSE_URL || '/api';
