import buildServer from './src/server';
import { connectDB, closeDB } from './src/utils/db';
import { connectRedis, closeRedis } from './src/utils/redis';

async function main() {
  await connectDB();
  await connectRedis();

  const app = await buildServer();

  const port = parseInt(process.env.PORT || '3000', 10);
  const host = '0.0.0.0';

  app.log.info(`Server starting on ${host}:${port}`);

  await app.listen({ port, host });

  process.on('SIGTERM', async () => {
    app.log.info('SIGTERM received, closing gracefully');
    await Promise.all([app.close(), closeDB(), closeRedis()]);
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
