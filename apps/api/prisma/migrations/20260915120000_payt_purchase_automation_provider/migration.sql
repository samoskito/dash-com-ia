-- Payt provider enum only.
-- IMPORTANT: do NOT insert rows that reference 'payt' in this same migration.
-- PostgreSQL cannot use a newly added enum label until the transaction commits,
-- and Prisma wraps each migration in a transaction → ADD VALUE + INSERT fails (P3009).
ALTER TYPE "InboundWebhookProvider" ADD VALUE IF NOT EXISTS 'payt';
