-- CreateTable
CREATE TABLE "PaymentEmittedEvent" (
    "paymentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emittedAt" TIMESTAMP(3),
    "emitAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastEmitError" TEXT,

    CONSTRAINT "PaymentEmittedEvent_pkey" PRIMARY KEY ("paymentId")
);

-- CreateIndex
CREATE INDEX "PaymentEmittedEvent_emittedAt_createdAt_idx" ON "PaymentEmittedEvent"("emittedAt", "createdAt");

-- AddForeignKey
ALTER TABLE "PaymentEmittedEvent" ADD CONSTRAINT "PaymentEmittedEvent_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
