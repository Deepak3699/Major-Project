process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/test_db';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.JWT_SECRET = 'test-jwt-secret-do-not-use-in-prod';
process.env.ENCRYPTION_SECRET = 'test-encryption-secret-0123456789abcdef';
