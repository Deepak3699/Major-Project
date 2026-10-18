/**
 * Human-friendly error diagnostic formatter for Take It.
 * Converts raw socket, database, and Redis errors into clear, actionable advice.
 */

export function printDatabaseError(err: any, dbUrl?: string): void {
  const errMsg = String(err?.message || err);
  const isConnRefused = errMsg.includes('ECONNREFUSED') || err?.code === 'ECONNREFUSED';
  const isAuthFailed = errMsg.includes('password authentication failed') || err?.code === '28P01';
  const isDbNotFound = errMsg.includes('does not exist') || err?.code === '3D000';

  console.error('\n' + '═'.repeat(72));
  console.error('❌ \x1b[1m\x1b[31mPOSTGRESQL CONNECTION ERROR (Database Error)\x1b[0m');
  console.error('═'.repeat(72));

  if (isConnRefused) {
    console.error('\x1b[33mKahan error hai:\x1b[0m PostgreSQL Server (Port 5432)');
    console.error('\x1b[33mKaya problem hai:\x1b[0m PostgreSQL server aapke computer par chal nahi raha hai (Connection Refused).');
    console.error('\n\x1b[1m\x1b[36m👉 Ise theek karne ke aasan tareeqe (Solutions):\x1b[0m');
    console.error('  1. \x1b[1mWindows Service Start karein:\x1b[0m');
    console.error('     - Press Win + R, type `services.msc` aur Enter dabayein.');
    console.error('     - List me `postgresql-x64-XX` dhoondein aur right-click karke "Start" karein.');
    console.error('  2. \x1b[1mYa Free Cloud Database use karein (Bina local install ke):\x1b[0m');
    console.error('     - https://neon.tech ya https://supabase.com par free account banayein.');
    console.error('     - Apne root `.env` file me `DATABASE_URL` ko cloud connection string se replace karein:');
    console.error('       DATABASE_URL=postgresql://user:password@ep-xyz.neon.tech/neondb?sslmode=require');
  } else if (isAuthFailed) {
    console.error('\x1b[33mKahan error hai:\x1b[0m PostgreSQL Authentication (Username/Password)');
    console.error('\x1b[33mKaya problem hai:\x1b[0m `.env` file me diya gaya password galat hai.');
    console.error('\n\x1b[1m\x1b[36m👉 Solution:\x1b[0m');
    console.error('  - Apne root `.env` file me `DATABASE_URL` me sahi password daalein:');
    console.error('    DATABASE_URL=postgresql://postgres:AAPKA_SAHI_PASSWORD@localhost:5432/leads_db');
  } else if (isDbNotFound) {
    console.error('\x1b[33mKahan error hai:\x1b[0m Database "leads_db" nahi mila');
    console.error('\x1b[33mKaya problem hai:\x1b[0m PostgreSQL me "leads_db" database exist nahi karta.');
    console.error('\n\x1b[1m\x1b[36m👉 Solution:\x1b[0m');
    console.error('  - `npm run db:init` chalayein, yeh automatically database aur tables bana dega.');
  } else {
    console.error('\x1b[33mRaw Error Message:\x1b[0m', errMsg);
  }

  if (dbUrl) {
    // Redact password
    const safeUrl = dbUrl.replace(/:([^:@]+)@/, ':****@');
    console.error(`\n\x1b[90mCurrent DATABASE_URL: ${safeUrl}\x1b[0m`);
  }
  console.error('═'.repeat(72) + '\n');
}

export function printRedisError(err: any, redisUrl?: string): void {
  const errMsg = String(err?.message || err);
  const isConnRefused = errMsg.includes('ECONNREFUSED') || err?.code === 'ECONNREFUSED';

  console.error('\n' + '═'.repeat(72));
  console.error('❌ \x1b[1m\x1b[31mREDIS CONNECTION ERROR (Cache & Queue Error)\x1b[0m');
  console.error('═'.repeat(72));

  if (isConnRefused) {
    console.error('\x1b[33mKahan error hai:\x1b[0m Redis Server (Port 6379)');
    console.error('\x1b[33mKaya problem hai:\x1b[0m Redis server aapke computer par chal nahi raha hai (Connection Refused).');
    console.error('\n\x1b[1m\x1b[36m👉 Ise theek karne ke aasan tareeqe (Solutions):\x1b[0m');
    console.error('  1. \x1b[1mWSL ke zariye Redis chalayein:\x1b[0m');
    console.error('     Terminal me run karein: `wsl sudo service redis-server start`');
    console.error('  2. \x1b[1mYa Free Cloud Redis use karein (Upstash):\x1b[0m');
    console.error('     - https://upstash.com par free Redis database banayein.');
    console.error('     - `.env` me REDIS_URL update karein:');
    console.error('       REDIS_URL=rediss://default:token@xyz.upstash.io:6379');
    console.error('  3. \x1b[1mYa Docker se Redis start karein:\x1b[0m');
    console.error('     docker run -d -p 6379:6379 redis:7-alpine');
  } else {
    console.error('\x1b[33mRaw Error Message:\x1b[0m', errMsg);
  }

  if (redisUrl) {
    console.error(`\n\x1b[90mCurrent REDIS_URL: ${redisUrl}\x1b[0m`);
  }
  console.error('═'.repeat(72) + '\n');
}

export function printPortError(port: number | string): void {
  console.error('\n' + '═'.repeat(72));
  console.error('❌ \x1b[1m\x1b[31mPORT ALREADY IN USE ERROR (Port Conflict)\x1b[0m');
  console.error('═'.repeat(72));
  console.error(`\x1b[33mKahan error hai:\x1b[0m Port ${port}`);
  console.error(`\x1b[33mKaya problem hai:\x1b[0m Port ${port} pehle se kisi aur program me open hai.`);
  console.error('\n\x1b[1m\x1b[36m👉 Solutions:\x1b[0m');
  console.error(`  1. Purana server terminate karein (Ctrl + C dabayein purane terminal me).`);
  console.error(`  2. Ya .env file me PORT=3001 karke naye port par start karein.`);
  console.error('═'.repeat(72) + '\n');
}
