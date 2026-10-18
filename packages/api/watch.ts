import buildServer from './src/server';
import { connectDB, closeDB } from './src/utils/db';
import { connectRedis, closeRedis } from './src/utils/redis';
import { printPortError } from './src/utils/friendlyErrors';

async function main() {
  const port = parseInt(process.env.PORT || '3000', 10);
  const host = '0.0.0.0';

  console.info('\n⏳ [Take It API] Connecting to PostgreSQL and Redis...');
  await connectDB();
  await connectRedis();

  const app = await buildServer();

  try {
    await app.listen({ port, host });
  } catch (err: any) {
    if (err.code === 'EADDRINUSE') {
      printPortError(port);
      process.exit(1);
    }
    throw err;
  }

  console.info('\n' + '═'.repeat(68));
  console.info('🚀 \x1b[1m\x1b[32mTake It Backend API Started Successfully!\x1b[0m');
  console.info('═'.repeat(68));
  console.info(`  • \x1b[1mAPI URL:\x1b[0m       http://localhost:${port}`);
  console.info(`  • \x1b[1mHealth Check:\x1b[0m  http://localhost:${port}/health`);
  console.info('  • \x1b[1mPostgreSQL:\x1b[0m    ✅ Connected');
  console.info('  • \x1b[1mRedis:\x1b[0m         ✅ Connected');
  console.info('  • \x1b[1mFrontend:\x1b[0m      http://localhost:5173 (run in packages/web)');
  console.info('═'.repeat(68) + '\n');

  process.on('SIGTERM', async () => {
    app.log.info('SIGTERM received, closing gracefully');
    await Promise.all([app.close(), closeDB(), closeRedis()]);
    process.exit(0);
  });
}

main().catch(() => {
  // Details already printed by friendly error handlers
  console.error('\n❌ [Take It API] Startup aborted due to connection failure. See above for solution.\n');
  process.exit(1);
});
