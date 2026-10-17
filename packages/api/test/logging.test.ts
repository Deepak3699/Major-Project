import { getPrometheusMetrics, resetMetrics, getMetricsSnapshot, log, logger } from '../src/utils/logging';

describe('Logging & Metrics (SRS §3.17)', () => {
  let originalLog: typeof console.log;

  beforeEach(() => {
    originalLog = console.log;
    console.log = jest.fn();
    resetMetrics();
  });

  afterEach(() => {
    console.log = originalLog;
  });

  describe('logger', () => {
    test('logger.info calls console.log with structured output', () => {
      logger().info('test message', { foo: 'bar' });
      expect(console.log).toHaveBeenCalled();
      const output = (console.log as jest.Mock).mock.calls[0][0];
      expect(output).toContain('test message');
      expect(output).toMatch(/\[INFO\]|\[info\]/);
    });

    test('logger.error calls console.log with error level', () => {
      logger().error('error message');
      expect(console.log).toHaveBeenCalled();
      const output = (console.log as jest.Mock).mock.calls[0][0];
      expect(output).toMatch(/\[ERROR\]|\[error\]/);
      expect(output).toContain('error message');
    });

    test('JSON format outputs parseable JSON', () => {
      process.env.LOG_FORMAT = 'json';
      logger().info('json test', { key: 'value' });
      const output = (console.log as jest.Mock).mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.msg).toBe('json test');
      expect(parsed.key).toBe('value');
      expect(parsed.level).toBe('info');
      delete process.env.LOG_FORMAT;
    });

    test('log function with no fields does not throw', () => {
      expect(() => log('info', 'plain message')).not.toThrow();
    });
  });

  describe('metrics', () => {
    test('resetMetrics clears all counters', () => {
      resetMetrics();
      const snapshot = getMetricsSnapshot();
      expect(snapshot.requests).toBe(0);
      expect(snapshot.errors).toBe(0);
    });

    test('getPrometheusMetrics returns valid Prometheus format', () => {
      const metrics = getPrometheusMetrics();
      expect(metrics).toContain('# HELP hiregen_requests_total');
      expect(metrics).toContain('# TYPE hiregen_requests_total counter');
      expect(metrics).toContain('# HELP hiregen_errors_total');
      expect(metrics).toContain('# TYPE hiregen_errors_total counter');
      expect(metrics).toContain('# HELP hiregen_uptime_seconds');
      expect(metrics).toContain('# TYPE hiregen_uptime_seconds gauge');
    });

    test('getMetricsSnapshot returns all fields', () => {
      const snapshot = getMetricsSnapshot();
      expect(snapshot).toHaveProperty('requests');
      expect(snapshot).toHaveProperty('errors');
      expect(snapshot).toHaveProperty('total_duration_ms');
      expect(snapshot).toHaveProperty('status_codes');
      expect(snapshot).toHaveProperty('uptime_seconds');
      expect(typeof snapshot.uptime_seconds).toBe('number');
    });
  });
});
