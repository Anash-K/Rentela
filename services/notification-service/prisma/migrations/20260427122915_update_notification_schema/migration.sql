/*
  Warnings:

  - The values [READ] on the enum `NotificationStatus` will be removed. If these variants are still used in the database, this will fail.
  - A unique constraint covering the columns `[dedupeKey]` on the table `Notification` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- AlterEnum
BEGIN;
CREATE TYPE "NotificationStatus_new" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED');
ALTER TABLE "notification"."Notification" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Notification" ALTER COLUMN "status" TYPE "NotificationStatus_new" USING ("status"::text::"NotificationStatus_new");
ALTER TYPE "NotificationStatus" RENAME TO "NotificationStatus_old";
ALTER TYPE "NotificationStatus_new" RENAME TO "NotificationStatus";
DROP TYPE "notification"."NotificationStatus_old";
ALTER TABLE "Notification" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "actionUrl" TEXT,
ADD COLUMN     "dedupeKey" TEXT,
ADD COLUMN     "eventKey" TEXT,
ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "isRead" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "scheduledAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Template" ADD COLUMN     "description" TEXT,
ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'en';

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");
