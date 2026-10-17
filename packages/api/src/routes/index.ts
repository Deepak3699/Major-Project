import { FastifyPluginAsync } from 'fastify';
import { leadsRoutes } from './leads';
import { authRoutes } from './auth';
import { adminRoutes } from './admin';
import { webhookRoutes } from './webhooks';
import { dashboardRoutes } from './dashboard';
import { wsRoutes } from './ws';
import { companiesRoutes } from './companies';
import { contactsRoutes } from './contacts';
import { complianceRoutes } from './compliance';

const routes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  fastify.register(authRoutes, { prefix: '/auth' });
  fastify.register(leadsRoutes, { prefix: '/leads' });
  fastify.register(adminRoutes, { prefix: '' });
  fastify.register(webhookRoutes, { prefix: '/webhooks' });
  fastify.register(dashboardRoutes, { prefix: '/dashboard' });
  fastify.register(wsRoutes, { prefix: '' });
  fastify.register(companiesRoutes, { prefix: '/companies' });
  fastify.register(contactsRoutes, { prefix: '/contacts' });
  // Public self-service opt-out + admin right-to-erasure (compliance).
  fastify.register(complianceRoutes, { prefix: '' });
};

export default routes;
