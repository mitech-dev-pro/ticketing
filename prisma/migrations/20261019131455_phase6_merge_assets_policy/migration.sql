-- AlterTable
ALTER TABLE `ticket` ADD COLUMN `assetId` VARCHAR(191) NULL,
    ADD COLUMN `mergedIntoId` INTEGER NULL,
    ADD COLUMN `parentId` INTEGER NULL,
    ADD COLUMN `policyNumber` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `ticketevent` MODIFY `type` ENUM('CREATED', 'MESSAGE', 'NOTE', 'ASSIGNED', 'FORWARDED', 'PRIORITY_CHANGED', 'STATUS_CHANGED', 'RESOLVED', 'CONFIDENTIAL_CHANGED', 'REOPENED', 'ESCALATED', 'RATED', 'RATING_FOLLOWED_UP', 'BLOCKED_BY', 'BLOCKS', 'RELATED_TO', 'TASK', 'TIME', 'MERGED', 'MERGED_IN', 'CHILD') NOT NULL;

-- CreateTable
CREATE TABLE `Asset` (
    `id` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `model` VARCHAR(191) NOT NULL,
    `ownerDepartmentId` VARCHAR(191) NOT NULL,
    `holderUserId` VARCHAR(191) NULL,
    `location` VARCHAR(191) NOT NULL,
    `status` ENUM('IN_USE', 'FAULTY', 'UNDER_REPAIR', 'RETIRED') NOT NULL,
    `warranty` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Asset_ownerDepartmentId_idx`(`ownerDepartmentId`),
    INDEX `Asset_holderUserId_idx`(`holderUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Policy` (
    `number` VARCHAR(191) NOT NULL,
    `product` VARCHAR(191) NOT NULL,
    `holder` VARCHAR(191) NOT NULL,
    `premium` VARCHAR(191) NOT NULL,
    `payMethod` VARCHAR(191) NOT NULL,
    `since` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`number`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Claim` (
    `number` VARCHAR(191) NOT NULL,
    `policyNumber` VARCHAR(191) NOT NULL,

    INDEX `Claim_policyNumber_idx`(`policyNumber`),
    PRIMARY KEY (`number`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Ticket` ADD CONSTRAINT `Ticket_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `Ticket`(`number`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Ticket` ADD CONSTRAINT `Ticket_mergedIntoId_fkey` FOREIGN KEY (`mergedIntoId`) REFERENCES `Ticket`(`number`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Ticket` ADD CONSTRAINT `Ticket_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `Asset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Asset` ADD CONSTRAINT `Asset_ownerDepartmentId_fkey` FOREIGN KEY (`ownerDepartmentId`) REFERENCES `Department`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Asset` ADD CONSTRAINT `Asset_holderUserId_fkey` FOREIGN KEY (`holderUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Claim` ADD CONSTRAINT `Claim_policyNumber_fkey` FOREIGN KEY (`policyNumber`) REFERENCES `Policy`(`number`) ON DELETE RESTRICT ON UPDATE CASCADE;
