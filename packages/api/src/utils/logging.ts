import type { FastifyRequest, FastifyReply } from 'fastify';

type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug';

interface LogFields {
  [key: string]: unknown;
}

let requestCount = 0;
let errorCount = 0;
let totalDurationMs = 0;
let statusCodeCounts: Record<number, number> = {};
let lastReset = Date.now();

const METRICS_WINDOW_MS = 60_000;

function log(level: LogLevel, msg: string, fields: LogFields = {}): void {
  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...fields,
  };

  if (process.env.LOG_FORMAT === 'json') {
    console.log(JSON.stringify(entry));
  } else {
    const extra = Object.entries(fields)
      .filter(([k]) => k !== 'ts' && k !== 'level' && k !== 'msg')
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(' ');
    console.log(`[${entry.ts}] [${level.toUpperCase()}] ${msg}${extra ? ' ' + extra : ''}`);
  }
}

export { log };

export function logger() {
  return {
    info: (msg: string, fields?: LogFields) => log('info', msg, fields),
    warn: (msg: string, fields?: LogFields) => log('warn', msg, fields),
    error: (msg: string, fields?: LogFields) => log('error', msg, fields),
    debug: (msg: string, fields?: LogFields) => log('debug', msg, fields),
    fatal: (msg: string, fields?: LogFields) => log('fatal', msg, fields),
  };
}

export async function requestLogger(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  requestCount++;
  const start = process.hrtime.bigint();

  reply.raw.on('finish', () => {
    const durationNs = Number(process.hrtime.bigint() - start);
    const durationMs = Math.round(durationNs / 1_000_000);
    totalDurationMs += durationMs;

    const status = reply.statusCode;
    statusCodeCounts[status] = (statusCodeCounts[status] || 0) + 1;
    if (status >= 500) {
      errorCount++;
    }

    const user = request.user as { id?: string } | undefined;

    request.log?.info({
      method: request.method,
      url: request.url,
      statusCode: status,
      durationMs,
      userAgent: request.headers['user-agent'],
      userId: user?.id,
    }, 'request_complete');
  });
}

export function getPrometheusMetrics(): string {
  const now = Date.now();
  if (now - lastReset >= METRICS_WINDOW_MS) {
    requestCount = 0;
    errorCount = 0;
    totalDurationMs = 0;
    statusCodeCounts = {};
    lastReset = now;
  }

  const lines: string[] = [];
  lines.push('# HELP hiregen_requests_total Total HTTP requests (current window)');
  lines.push('# TYPE hiregen_requests_total counter');
  lines.push(`hiregen_requests_total ${requestCount}`);

  lines.push('# HELP hiregen_errors_total Total HTTP errors (5xx)');
  lines.push('# TYPE hiregen_errors_total counter');
  lines.push(`hiregen_errors_total ${errorCount}`);

  lines.push('# HELP hiregen_request_duration_ms_total Total request duration in ms (window)');
  lines.push('# TYPE hiregen_request_duration_ms_total counter');
  lines.push(`hiregen_request_duration_ms_total ${totalDurationMs}`);

  lines.push('# HELP hiregen_requests_by_status HTTP requests by status code');
  lines.push('# TYPE hiregen_requests_by_status counter');
  for (const [code, count] of Object.entries(statusCodeCounts)) {
    lines.push(`hiregen_requests_by_status{code="${code}"} ${count}`);
  }

  lines.push('# HELP hiregen_uptime_seconds Service uptime in seconds');
  lines.push('# TYPE hiregen_uptime_seconds gauge');
  lines.push(`hiregen_uptime_seconds ${Math.floor(process.uptime())}`);

  return lines.join('\n') + '\n';
}

export function resetMetrics(): void {
  requestCount = 0;
  errorCount = 0;
  totalDurationMs = 0;
  statusCodeCounts = {};
  lastReset = Date.now();
}

export function getMetricsSnapshot(): Record<string, unknown> {
  return {
    requests: requestCount,
    errors: errorCount,
    total_duration_ms: totalDurationMs,
    status_codes: statusCodeCounts,
    uptime_seconds: Math.floor(process.uptime()),
  };
}
