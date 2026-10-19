-- AlterTable
ALTER TABLE `ticketevent` MODIFY `type` ENUM('CREATED', 'MESSAGE', 'NOTE', 'ASSIGNED', 'FORWARDED', 'PRIORITY_CHANGED', 'STATUS_CHANGED', 'RESOLVED', 'CONFIDENTIAL_CHANGED', 'REOPENED', 'ESCALATED', 'RATED', 'RATING_FOLLOWED_UP', 'BLOCKED_BY', 'BLOCKS', 'RELATED_TO', 'TASK', 'TIME') NOT NULL;

-- CreateTable
CREATE TABLE `Task` (
    `id` VARCHAR(191) NOT NULL,
    `ticketId` INTEGER NOT NULL,
    `text` VARCHAR(191) NOT NULL,
    `done` BOOLEAN NOT NULL DEFAULT false,
    `order` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Task_ticketId_idx`(`ticketId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TimeEntry` (
    `id` VARCHAR(191) NOT NULL,
    `ticketId` INTEGER NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `minutes` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TimeEntry_ticketId_idx`(`ticketId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TicketTimer` (
    `id` VARCHAR(191) NOT NULL,
    `ticketId` INTEGER NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `TicketTimer_ticketId_userId_key`(`ticketId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TicketLink` (
    `id` VARCHAR(191) NOT NULL,
    `fromId` INTEGER NOT NULL,
    `toId` INTEGER NOT NULL,
    `type` ENUM('BLOCKED_BY', 'BLOCKS', 'RELATED_TO') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TicketLink_fromId_idx`(`fromId`),
    INDEX `TicketLink_toId_idx`(`toId`),
    UNIQUE INDEX `TicketLink_fromId_toId_type_key`(`fromId`, `toId`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_ticketId_fkey` FOREIGN KEY (`ticketId`) REFERENCES `Ticket`(`number`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TimeEntry` ADD CONSTRAINT `TimeEntry_ticketId_fkey` FOREIGN KEY (`ticketId`) REFERENCES `Ticket`(`number`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TimeEntry` ADD CONSTRAINT `TimeEntry_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TicketTimer` ADD CONSTRAINT `TicketTimer_ticketId_fkey` FOREIGN KEY (`ticketId`) REFERENCES `Ticket`(`number`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TicketTimer` ADD CONSTRAINT `TicketTimer_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TicketLink` ADD CONSTRAINT `TicketLink_fromId_fkey` FOREIGN KEY (`fromId`) REFERENCES `Ticket`(`number`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TicketLink` ADD CONSTRAINT `TicketLink_toId_fkey` FOREIGN KEY (`toId`) REFERENCES `Ticket`(`number`) ON DELETE CASCADE ON UPDATE CASCADE;
