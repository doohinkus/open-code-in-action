-- CreateTable
CREATE TABLE "Share" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Shared component',
    "data" TEXT NOT NULL DEFAULT '{}',
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Share_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Share_token_key" ON "Share"("token");

-- CreateIndex
CREATE INDEX "Share_projectId_idx" ON "Share"("projectId");

-- AddForeignKey
ALTER TABLE "Share" ADD CONSTRAINT "Share_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
