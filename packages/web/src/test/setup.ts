import '@testing-library/jest-dom';

// jsdom has no Vite define step, so src/lib/env.ts (the only module reading
// import.meta) is mocked per-suite rather than globally.
