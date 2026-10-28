ALTER TABLE "User"
  ADD COLUMN "twoFactorSecret" TEXT,
  ADD COLUMN "twoFactorEnabledAt" TIMESTAMP(3),
  ADD COLUMN "twoFactorFailedAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "twoFactorLockedUntil" TIMESTAMP(3),
  ADD COLUMN "twoFactorLastStep" BIGINT,
  ADD COLUMN "twoFactorRecoveryCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "loginFailedAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "loginLockedUntil" TIMESTAMP(3),
  ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0;
