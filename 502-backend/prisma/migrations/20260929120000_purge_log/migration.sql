-- CreateEnum
CREATE TYPE "PurgeScope" AS ENUM ('BRANCH', 'ALL');

-- CreateTable
CREATE TABLE "DataPurgeLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "username" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "scope" "PurgeScope" NOT NULL,
    "branchCode" TEXT,
    "branchName" TEXT,
    "success" BOOLEAN NOT NULL,
    "deleted" JSONB,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataPurgeLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DataPurgeLog_createdAt_idx" ON "DataPurgeLog"("createdAt");

-- AddForeignKey
ALTER TABLE "DataPurgeLog" ADD CONSTRAINT "DataPurgeLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

