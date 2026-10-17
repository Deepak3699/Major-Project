import { FastifyPluginAsync } from 'fastify';
import { getDB } from '../utils/db';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/auth';

export const dashboardRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  fastify.get(
    '/stats',
    { preValidation: [authorize(['admin', 'sales_rep'])] },
    async (_req, _reply) => {
      const sql = getDB();

      const funnelResult = await sql.unsafe(`
        SELECT pipeline_stage, COUNT(*) as count
        FROM leads
        GROUP BY pipeline_stage
      `);

      const funnel = (funnelResult as unknown as Array<{ pipeline_stage: string; count: number }>).reduce(
        (acc: Record<string, number>, row) => {
          acc[row.pipeline_stage] = Number(row.count);
        return acc;
      }, {});

      const totalLeads = await sql.unsafe(`SELECT COUNT(*) as total FROM leads`);
      const hotLeads = await sql.unsafe(`SELECT COUNT(*) as total FROM leads WHERE score_band = 'hot'`);
      const warmLeads = await sql.unsafe(`SELECT COUNT(*) as total FROM leads WHERE score_band = 'warm'`);
      const coldLeads = await sql.unsafe(`SELECT COUNT(*) as total FROM leads WHERE score_band = 'cold'`);

      const sourceHealth = await sql.unsafe(`
        SELECT source_name, consecutive_failures, circuit_open_until IS NOT NULL as is_open
        FROM source_health
        ORDER BY source_name
      `);

      const recentRuns = await sql.unsafe(`
        SELECT started_at, finished_at, sources_attempted, sources_succeeded,
               sources_circuit_broken, leads_found, leads_deduped
        FROM scrape_runs
        ORDER BY started_at DESC
        LIMIT 10
      `);

      const creditUsage = await sql.unsafe(`
        SELECT provider, COUNT(*) as calls, SUM(credits_used) as credits
        FROM enrichment_log
        WHERE created_at > NOW() - INTERVAL '30 days'
        GROUP BY provider
        ORDER BY credits DESC
      `);

      const noContact = await sql.unsafe(`SELECT COUNT(*) as total FROM leads WHERE do_not_contact = true`);

      const trend = await sql.unsafe(`
        SELECT to_char(created_at, 'YYYY-MM-DD') as day, COUNT(*) as discovered
        FROM leads
        WHERE created_at > NOW() - INTERVAL '14 days'
        GROUP BY 1 ORDER BY 1
      `);

      const verificationOutcomes = await sql.unsafe(`
        SELECT channel, result, COUNT(*) as count
        FROM verification_log
        WHERE created_at > NOW() - INTERVAL '7 days'
        GROUP BY channel, result
      `);

      const outreachOutcomes = await sql.unsafe(`
        SELECT channel, delivery_status, COUNT(*) as count
        FROM outreach_log
        WHERE sent_at > NOW() - INTERVAL '7 days'
        GROUP BY channel, delivery_status
      `);

      const new24h = await sql.unsafe(
        `SELECT COUNT(*) as total FROM leads WHERE created_at > NOW() - INTERVAL '24 hours'`,
      );

      return {
        funnel,
        totals: {
          total_leads: Number(totalLeads[0]?.total ?? 0),
          hot: Number(hotLeads[0]?.total ?? 0),
          warm: Number(warmLeads[0]?.total ?? 0),
          cold: Number(coldLeads[0]?.total ?? 0),
          do_not_contact: Number(noContact[0]?.total ?? 0),
          new_24h: Number((new24h[0] as any)?.total ?? 0),
        },
        trend_14d: trend,
        verification_7d: verificationOutcomes,
        outreach_7d: outreachOutcomes,
        source_health: sourceHealth,
        recent_runs: recentRuns,
        credit_usage: creditUsage,
      };
    },
  );

  fastify.get(
    '/credits',
    { preValidation: [authorize(['admin', 'sales_rep'])] },
    async (_req, _reply) => {
      const sql = getDB();

      const creditUsage = await sql.unsafe(`
        SELECT provider, COUNT(*) as calls, SUM(credits_used) as credits
        FROM enrichment_log
        WHERE created_at > NOW() - INTERVAL '30 days'
        GROUP BY provider
        ORDER BY credits DESC
      `);

      const totalCredits = creditUsage.reduce(
        (acc: number, row: any) => acc + Number(row.credits || 0),
        0,
      );

      const byProvider: Record<string, { used: number; limit: number }> = {};
      for (const row of creditUsage as any[]) {
        byProvider[row.provider] = {
          used: Number(row.credits || 0),
          limit: 1000,
        };
      }

      return {
        used: totalCredits,
        limit: 1000,
        remaining: Math.max(0, 1000 - totalCredits),
        percent: Math.min((totalCredits / 1000) * 100, 100),
        by_provider: byProvider,
        period_start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        period_end: new Date().toISOString(),
      };
    },
  );
};
