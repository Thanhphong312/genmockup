-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NOT NULL DEFAULT 'user',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `users_username_key`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `app_settings` (
    `userId` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `value` TEXT NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`userId`, `key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `idea_generations` (
    `id` VARCHAR(191) NOT NULL,
    `ownerId` VARCHAR(191) NULL,
    `title` TEXT NOT NULL,
    `keyword` TEXT NOT NULL,
    `sourceImagePath` TEXT NOT NULL,
    `analysis` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `error` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idea_generations_ownerId_idx`(`ownerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `idea_images` (
    `id` VARCHAR(191) NOT NULL,
    `ownerId` VARCHAR(191) NULL,
    `generationId` VARCHAR(191) NULL,
    `filePath` TEXT NOT NULL,
    `prompt` TEXT NULL,
    `ideaTitle` TEXT NULL,
    `sellingPoints` TEXT NULL,
    `keyword` TEXT NULL,
    `title` TEXT NULL,
    `usedCount` INTEGER NOT NULL DEFAULT 0,
    `width` INTEGER NOT NULL,
    `height` INTEGER NOT NULL,
    `saved` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idea_images_ownerId_idx`(`ownerId`),
    INDEX `idea_images_generationId_idx`(`generationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mockups` (
    `id` VARCHAR(191) NOT NULL,
    `ownerId` VARCHAR(191) NULL,
    `name` TEXT NOT NULL,
    `filePath` TEXT NOT NULL,
    `width` INTEGER NOT NULL,
    `height` INTEGER NOT NULL,
    `designX` INTEGER NOT NULL,
    `designY` INTEGER NOT NULL,
    `designWidth` INTEGER NOT NULL,
    `designHeight` INTEGER NOT NULL,
    `designRotation` DOUBLE NOT NULL DEFAULT 0,
    `watermarkX` INTEGER NULL,
    `watermarkY` INTEGER NULL,
    `watermarkWidth` INTEGER NULL,
    `watermarkHeight` INTEGER NULL,
    `watermarkRotation` DOUBLE NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `mockups_ownerId_idx`(`ownerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mockup_shares` (
    `id` VARCHAR(191) NOT NULL,
    `mockupId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `mockup_shares_userId_idx`(`userId`),
    UNIQUE INDEX `mockup_shares_mockupId_userId_key`(`mockupId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `watermarks` (
    `id` VARCHAR(191) NOT NULL,
    `ownerId` VARCHAR(191) NULL,
    `name` TEXT NOT NULL,
    `filePath` TEXT NOT NULL,
    `width` INTEGER NOT NULL,
    `height` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `watermarks_ownerId_idx`(`ownerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shirt_sets` (
    `id` VARCHAR(191) NOT NULL,
    `ownerId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `designX` INTEGER NOT NULL,
    `designY` INTEGER NOT NULL,
    `designWidth` INTEGER NOT NULL,
    `designHeight` INTEGER NOT NULL,
    `designRotation` DOUBLE NOT NULL DEFAULT 0,
    `watermarkX` INTEGER NULL,
    `watermarkY` INTEGER NULL,
    `watermarkWidth` INTEGER NULL,
    `watermarkHeight` INTEGER NULL,
    `watermarkRotation` DOUBLE NULL,
    `representativeColor` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `shirt_sets_ownerId_idx`(`ownerId`),
    UNIQUE INDEX `shirt_sets_ownerId_name_key`(`ownerId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shirt_set_shares` (
    `id` VARCHAR(191) NOT NULL,
    `setId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `shirt_set_shares_userId_idx`(`userId`),
    UNIQUE INDEX `shirt_set_shares_setId_userId_key`(`setId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shirt_variants` (
    `id` VARCHAR(191) NOT NULL,
    `setId` VARCHAR(191) NOT NULL,
    `color` VARCHAR(191) NOT NULL,
    `filePath` TEXT NOT NULL,
    `width` INTEGER NOT NULL,
    `height` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `shirt_variants_setId_color_key`(`setId`, `color`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `skin_scenes` (
    `id` VARCHAR(191) NOT NULL,
    `ownerId` VARCHAR(191) NULL,
    `name` TEXT NOT NULL,
    `filePath` TEXT NOT NULL,
    `width` INTEGER NOT NULL,
    `height` INTEGER NOT NULL,
    `cornersJson` TEXT NOT NULL,
    `ctrlJson` TEXT NOT NULL,
    `ratio` DOUBLE NOT NULL,
    `calibrated` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `skin_scenes_ownerId_idx`(`ownerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `skin_scene_shares` (
    `id` VARCHAR(191) NOT NULL,
    `sceneId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `skin_scene_shares_userId_idx`(`userId`),
    UNIQUE INDEX `skin_scene_shares_sceneId_userId_key`(`sceneId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `generations` (
    `id` VARCHAR(191) NOT NULL,
    `ownerId` VARCHAR(191) NULL,
    `productType` VARCHAR(191) NOT NULL DEFAULT 'card',
    `title` TEXT NULL,
    `designPath` TEXT NOT NULL,
    `designIsUrl` BOOLEAN NOT NULL DEFAULT false,
    `watermarkId` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `error` TEXT NULL,
    `durationMs` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `generations_ownerId_idx`(`ownerId`),
    INDEX `generations_watermarkId_idx`(`watermarkId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `generation_items` (
    `id` VARCHAR(191) NOT NULL,
    `generationId` VARCHAR(191) NOT NULL,
    `mockupId` VARCHAR(191) NULL,
    `variantId` VARCHAR(191) NULL,
    `sceneId` VARCHAR(191) NULL,
    `label` TEXT NULL,
    `outputPath` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `generation_items_generationId_idx`(`generationId`),
    INDEX `generation_items_mockupId_idx`(`mockupId`),
    INDEX `generation_items_variantId_idx`(`variantId`),
    INDEX `generation_items_sceneId_idx`(`sceneId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `idea_images` ADD CONSTRAINT `idea_images_generationId_fkey` FOREIGN KEY (`generationId`) REFERENCES `idea_generations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mockup_shares` ADD CONSTRAINT `mockup_shares_mockupId_fkey` FOREIGN KEY (`mockupId`) REFERENCES `mockups`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shirt_set_shares` ADD CONSTRAINT `shirt_set_shares_setId_fkey` FOREIGN KEY (`setId`) REFERENCES `shirt_sets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shirt_variants` ADD CONSTRAINT `shirt_variants_setId_fkey` FOREIGN KEY (`setId`) REFERENCES `shirt_sets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `skin_scene_shares` ADD CONSTRAINT `skin_scene_shares_sceneId_fkey` FOREIGN KEY (`sceneId`) REFERENCES `skin_scenes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `generations` ADD CONSTRAINT `generations_watermarkId_fkey` FOREIGN KEY (`watermarkId`) REFERENCES `watermarks`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `generation_items` ADD CONSTRAINT `generation_items_generationId_fkey` FOREIGN KEY (`generationId`) REFERENCES `generations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `generation_items` ADD CONSTRAINT `generation_items_mockupId_fkey` FOREIGN KEY (`mockupId`) REFERENCES `mockups`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `generation_items` ADD CONSTRAINT `generation_items_variantId_fkey` FOREIGN KEY (`variantId`) REFERENCES `shirt_variants`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `generation_items` ADD CONSTRAINT `generation_items_sceneId_fkey` FOREIGN KEY (`sceneId`) REFERENCES `skin_scenes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

