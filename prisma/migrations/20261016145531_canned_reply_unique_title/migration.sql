-- AlterTable
ALTER TABLE `CannedReply` DROP INDEX `CannedReply_departmentId_idx`,
    ADD UNIQUE INDEX `CannedReply_departmentId_title_key`(`departmentId`, `title`);
