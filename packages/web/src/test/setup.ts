import '@testing-library/jest-dom';

// jsdom has no Vite define step, so src/lib/env.ts (the only module reading
// import.meta) is mocked per-suite rather than globally.

class MockIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
}

// @ts-expect-error - jsdom test environment polyfill
global.IntersectionObserver = global.IntersectionObserver || MockIntersectionObserver;
