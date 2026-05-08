-- Sync schema columns to current Prisma model
ALTER TABLE contribution_offers
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;
