const path = require("path");
const File = require("../models/file.model");
const { assertFileOwnership } = require("../utils/fileValidation");

const DEFAULT_RETENTION_DAYS = 30;
const MAX_ACTIVE_FILES_PER_USER = 12;

/**
 * Calculates the expiration timestamp for a soft-deleted item.
 * @param {Date} [deletedAt=new Date()]
 * @param {number} [retentionDays=DEFAULT_RETENTION_DAYS]
 * @returns {Date}
 */
const calculateRetentionExpiry = (deletedAt = new Date(), retentionDays = DEFAULT_RETENTION_DAYS) => {
    const baseDate = deletedAt instanceof Date ? deletedAt : new Date(deletedAt);
    const expiryTime = baseDate.getTime() + retentionDays * 24 * 60 * 60 * 1000;
    return new Date(expiryTime);
};

/**
 * Counts the active (non-deleted) files for a given user.
 * @param {string} userId
 * @returns {Promise<number>}
 */
const countActiveUserFiles = async (userId) => {
    return await File.countDocuments({
        userId,
        isDeleted: { $ne: true },
    });
};

/**
 * Counts the soft-deleted files in the Recycle Bin for a given user.
 * @param {string} userId
 * @returns {Promise<number>}
 */
const countDeletedUserFiles = async (userId) => {
    return await File.countDocuments({
        userId,
        isDeleted: true,
    });
};

/**
 * Generates a non-colliding filename when restoring a file to an active workspace
 * where another file with identical name already exists.
 * @param {string} originalName
 * @param {Array<string>} activeNames
 * @returns {string}
 */
const resolveRestoreName = (originalName, activeNames = []) => {
    if (!activeNames || !activeNames.includes(originalName)) {
        return originalName;
    }

    const ext = path.extname(originalName);
    const baseName = path.basename(originalName, ext);

    let candidate = `${baseName} (restored)${ext}`;
    let counter = 2;

    while (activeNames.includes(candidate)) {
        candidate = `${baseName} (restored ${counter})${ext}`;
        counter++;
    }

    return candidate;
};

/**
 * Moves an active file to the Recycle Bin (soft delete).
 * Preserves the file and its version history completely.
 * @param {string} fileId
 * @param {string} userId
 * @returns {Promise<{ file: Object, alreadyDeleted: boolean }>}
 */
const softDeleteFile = async (fileId, userId) => {
    const file = await File.findOne({ _id: fileId, userId });
    assertFileOwnership(file, userId);

    if (file.isDeleted) {
        return { file, alreadyDeleted: true };
    }

    const now = new Date();
    file.isDeleted = true;
    file.deletedAt = now;
    file.deletionExpiresAt = calculateRetentionExpiry(now, DEFAULT_RETENTION_DAYS);
    file.deletedBy = userId;
    file.updatedAt = now;

    await file.save();

    return { file, alreadyDeleted: false };
};

/**
 * Restores a soft-deleted file back to the active workspace.
 * Resolves naming conflicts and enforces active quota limits.
 * @param {string} fileId
 * @param {string} userId
 * @returns {Promise<{ file: Object, renamed: boolean, restoredName: string }>}
 */
const restoreFileFromTrash = async (fileId, userId) => {
    const file = await File.findOne({ _id: fileId, userId });
    assertFileOwnership(file, userId);

    if (!file.isDeleted) {
        return { file, renamed: false, restoredName: file.originalName, alreadyActive: true };
    }

    // Verify user active quota
    const activeCount = await countActiveUserFiles(userId);
    if (activeCount >= MAX_ACTIVE_FILES_PER_USER) {
        const error = new Error(`Cannot restore: active file quota of ${MAX_ACTIVE_FILES_PER_USER} reached`);
        error.status = 400;
        throw error;
    }

    // Check for naming collisions in active files
    const activeFiles = await File.find({
        userId,
        isDeleted: { $ne: true },
    }).select("originalName").lean();

    const activeNames = activeFiles.map((f) => f.originalName);
    const resolvedName = resolveRestoreName(file.originalName, activeNames);
    const renamed = resolvedName !== file.originalName;

    file.isDeleted = false;
    file.deletedAt = null;
    file.deletionExpiresAt = null;
    file.deletedBy = null;
    file.updatedAt = new Date();

    if (renamed) {
        file.originalName = resolvedName;
    }

    await file.save();

    return {
        file,
        renamed,
        restoredName: resolvedName,
        alreadyActive: false,
    };
};

module.exports = {
    DEFAULT_RETENTION_DAYS,
    MAX_ACTIVE_FILES_PER_USER,
    calculateRetentionExpiry,
    countActiveUserFiles,
    countDeletedUserFiles,
    resolveRestoreName,
    softDeleteFile,
    restoreFileFromTrash,
};
