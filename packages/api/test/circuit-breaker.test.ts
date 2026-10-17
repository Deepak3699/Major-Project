import { CircuitBreaker } from '../src/utils/circuit-breaker';

describe('Circuit Breaker (SRS §9.2)', () => {
  test('closed initially', () => {
    const cb = new CircuitBreaker('test_source', 3, 1);
    expect(cb.isOpen).toBe(false);
    expect(cb.getState()).toBe('closed');
  });

  test('opens after failure threshold', () => {
    const cb = new CircuitBreaker('test_source', 3, 1);
    cb.onFailure();
    cb.onFailure();
    expect(cb.isOpen).toBe(false);
    cb.onFailure();
    expect(cb.isOpen).toBe(true);
    expect(cb.getState()).toBe('open');
  });

  test('closes on success', () => {
    const cb = new CircuitBreaker('test_source', 5, 1);
    cb.onFailure();
    cb.onFailure();
    cb.onSuccess();
    expect(cb.isOpen).toBe(false);
    expect(cb.failures).toBe(0);
  });

  test('half-open after cooldown', () => {
    const cb = new CircuitBreaker('test_source', 3, 1);
    cb.onFailure();
    cb.onFailure();
    cb.onFailure();
    expect(cb.isOpen).toBe(true);
    expect(cb.getState()).toBe('open');

    jest.useFakeTimers();
    jest.advanceTimersByTime(1100);

    expect(cb.isOpen).toBe(false);
    expect(cb.getState()).toBe('half_open');
    jest.useRealTimers();
  });

  test('reset clears state', () => {
    const cb = new CircuitBreaker('test_source', 3, 1);
    cb.onFailure();
    cb.onFailure();
    cb.reset();
    expect(cb.isOpen).toBe(false);
    expect(cb.failures).toBe(0);
    expect(cb.getState()).toBe('closed');
  });
});
