-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'DELETED');

-- CreateEnum
CREATE TYPE "OwnerType" AS ENUM ('USER', 'VEHICLE', 'BOOKING', 'INVOICE', 'CREDIT_NOTE', 'MAINTENANCE', 'OTHER');

-- CreateTable
CREATE TABLE "FileObject" (
    "id" TEXT NOT NULL,
    "ownerType" "OwnerType" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "extension" TEXT,
    "sizeBytes" INTEGER NOT NULL,
    "bucket" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "publicUrl" TEXT,
    "checksum" TEXT,
    "status" "FileStatus" NOT NULL DEFAULT 'ACTIVE',
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FileObject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FileObject_objectKey_key" ON "FileObject"("objectKey");

-- CreateIndex
CREATE INDEX "FileObject_ownerType_ownerId_idx" ON "FileObject"("ownerType", "ownerId");

-- CreateIndex
CREATE INDEX "FileObject_status_idx" ON "FileObject"("status");
