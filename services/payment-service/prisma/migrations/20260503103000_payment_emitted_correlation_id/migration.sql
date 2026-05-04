-- AlterTable
ALTER TABLE "PaymentEmittedEvent" ADD COLUMN "correlationId" TEXT;

UPDATE "PaymentEmittedEvent" SET "correlationId" = gen_random_uuid()::text WHERE "correlationId" IS NULL;

ALTER TABLE "PaymentEmittedEvent" ALTER COLUMN "correlationId" SET NOT NULL;

CREATE UNIQUE INDEX "PaymentEmittedEvent_correlationId_key" ON "PaymentEmittedEvent"("correlationId");
