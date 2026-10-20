-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('in_app', 'telegram');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('step_assigned', 'step_overdue', 'request_done', 'request_rejected');

-- AlterTable
ALTER TABLE "app_user" ADD COLUMN     "notificationPrefs" JSONB,
ADD COLUMN     "telegramChatId" TEXT,
ADD COLUMN     "telegramLinkCode" TEXT,
ADD COLUMN     "telegramLinkExpires" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "step_instance" ADD COLUMN     "overdueNotifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "notification" (
    "id" UUID NOT NULL,
    "recipientId" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "payload" JSONB NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "readAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_recipientId_channel_readAt_idx" ON "notification"("recipientId", "channel", "readAt");

-- CreateIndex
CREATE INDEX "notification_channel_sentAt_failedAt_idx" ON "notification"("channel", "sentAt", "failedAt");

-- CreateIndex
CREATE UNIQUE INDEX "app_user_telegramChatId_key" ON "app_user"("telegramChatId");

-- CreateIndex
CREATE UNIQUE INDEX "app_user_telegramLinkCode_key" ON "app_user"("telegramLinkCode");

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

