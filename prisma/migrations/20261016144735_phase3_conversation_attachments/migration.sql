-- AlterTable
ALTER TABLE `ticket` ADD COLUMN `csat` INTEGER NULL,
    ADD COLUMN `ratingFollowedUpAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `ticketevent` MODIFY `type` ENUM('CREATED', 'MESSAGE', 'NOTE', 'ASSIGNED', 'FORWARDED', 'PRIORITY_CHANGED', 'STATUS_CHANGED', 'RESOLVED', 'CONFIDENTIAL_CHANGED', 'REOPENED', 'ESCALATED', 'RATED', 'RATING_FOLLOWED_UP', 'BLOCKED_BY', 'BLOCKS', 'RELATED_TO') NOT NULL;

-- CreateTable
CREATE TABLE `Attachment` (
    `id` VARCHAR(191) NOT NULL,
    `ticketId` INTEGER NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,
    `uploadedById` VARCHAR(191) NOT NULL,
    `filename` VARCHAR(191) NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `sizeBytes` INTEGER NOT NULL,
    `storageKey` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Attachment_ticketId_idx`(`ticketId`),
    INDEX `Attachment_eventId_idx`(`eventId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CannedReply` (
    `id` VARCHAR(191) NOT NULL,
    `departmentId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CannedReply_departmentId_idx`(`departmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Attachment` ADD CONSTRAINT `Attachment_ticketId_fkey` FOREIGN KEY (`ticketId`) REFERENCES `Ticket`(`number`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Attachment` ADD CONSTRAINT `Attachment_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `TicketEvent`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Attachment` ADD CONSTRAINT `Attachment_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CannedReply` ADD CONSTRAINT `CannedReply_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
