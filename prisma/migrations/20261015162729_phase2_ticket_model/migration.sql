-- CreateTable
CREATE TABLE `Ticket` (
    `number` INTEGER NOT NULL AUTO_INCREMENT,
    `subject` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `fields` JSON NOT NULL,
    `requesterId` VARCHAR(191) NOT NULL,
    `requesterDepartmentId` VARCHAR(191) NOT NULL,
    `serviceTypeId` VARCHAR(191) NOT NULL,
    `assigneeId` VARCHAR(191) NULL,
    `priority` ENUM('URGENT', 'HIGH', 'MEDIUM', 'LOW') NOT NULL,
    `status` ENUM('OPEN', 'IN_PROGRESS', 'AWAITING_REQUESTER', 'RESOLVED', 'CLOSED') NOT NULL DEFAULT 'OPEN',
    `channel` ENUM('PORTAL', 'EMAIL', 'TEAMS') NOT NULL DEFAULT 'PORTAL',
    `confidential` BOOLEAN NOT NULL DEFAULT false,
    `dueAt` DATETIME(3) NOT NULL,
    `firstResponseDueAt` DATETIME(3) NOT NULL,
    `firstResponseAt` DATETIME(3) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `pausedAt` DATETIME(3) NULL,
    `pausedMs` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Ticket_status_idx`(`status`),
    INDEX `Ticket_priority_idx`(`priority`),
    INDEX `Ticket_assigneeId_idx`(`assigneeId`),
    INDEX `Ticket_requesterDepartmentId_idx`(`requesterDepartmentId`),
    INDEX `Ticket_confidential_idx`(`confidential`),
    PRIMARY KEY (`number`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TicketLeg` (
    `id` VARCHAR(191) NOT NULL,
    `ticketId` INTEGER NOT NULL,
    `departmentId` VARCHAR(191) NOT NULL,
    `byUserId` VARCHAR(191) NOT NULL,
    `reason` TEXT NULL,
    `inAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `outAt` DATETIME(3) NULL,

    INDEX `TicketLeg_ticketId_idx`(`ticketId`),
    INDEX `TicketLeg_departmentId_outAt_idx`(`departmentId`, `outAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TicketEvent` (
    `id` VARCHAR(191) NOT NULL,
    `ticketId` INTEGER NOT NULL,
    `type` ENUM('CREATED', 'MESSAGE', 'NOTE', 'ASSIGNED', 'FORWARDED', 'PRIORITY_CHANGED', 'STATUS_CHANGED', 'RESOLVED', 'CONFIDENTIAL_CHANGED', 'ESCALATED', 'RATED', 'BLOCKED_BY', 'BLOCKS', 'RELATED_TO') NOT NULL,
    `byUserId` VARCHAR(191) NULL,
    `body` TEXT NULL,
    `meta` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TicketEvent_ticketId_createdAt_idx`(`ticketId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TicketMention` (
    `id` VARCHAR(191) NOT NULL,
    `ticketId` INTEGER NOT NULL,
    `type` ENUM('PERSON', 'DEPARTMENT') NOT NULL,
    `userId` VARCHAR(191) NULL,
    `departmentId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TicketMention_ticketId_idx`(`ticketId`),
    INDEX `TicketMention_userId_idx`(`userId`),
    INDEX `TicketMention_departmentId_idx`(`departmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Ticket` ADD CONSTRAINT `Ticket_requesterId_fkey` FOREIGN KEY (`requesterId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Ticket` ADD CONSTRAINT `Ticket_requesterDepartmentId_fkey` FOREIGN KEY (`requesterDepartmentId`) REFERENCES `Department`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Ticket` ADD CONSTRAINT `Ticket_serviceTypeId_fkey` FOREIGN KEY (`serviceTypeId`) REFERENCES `ServiceType`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Ticket` ADD CONSTRAINT `Ticket_assigneeId_fkey` FOREIGN KEY (`assigneeId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TicketLeg` ADD CONSTRAINT `TicketLeg_ticketId_fkey` FOREIGN KEY (`ticketId`) REFERENCES `Ticket`(`number`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TicketLeg` ADD CONSTRAINT `TicketLeg_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TicketLeg` ADD CONSTRAINT `TicketLeg_byUserId_fkey` FOREIGN KEY (`byUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TicketEvent` ADD CONSTRAINT `TicketEvent_ticketId_fkey` FOREIGN KEY (`ticketId`) REFERENCES `Ticket`(`number`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TicketEvent` ADD CONSTRAINT `TicketEvent_byUserId_fkey` FOREIGN KEY (`byUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TicketMention` ADD CONSTRAINT `TicketMention_ticketId_fkey` FOREIGN KEY (`ticketId`) REFERENCES `Ticket`(`number`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TicketMention` ADD CONSTRAINT `TicketMention_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TicketMention` ADD CONSTRAINT `TicketMention_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- D-12: ticket numbers start at 24827. Seed tickets keep their prototype numbers
-- (24788-24826); MySQL then continues from here. Hand-added: Prisma cannot express
-- an autoincrement start value.
ALTER TABLE `Ticket` AUTO_INCREMENT = 24827;
