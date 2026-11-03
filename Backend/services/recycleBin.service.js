const path = require("path");
const File = require("../models/file.model");
const FileVersion = require("../models/fileVersion.model");
const DocumentChunk = require("../models/documentChunk.model");
const supabase = require("../config/supabase");
const {
    isValidObjectId,
    validateStoragePath,
    assertFileOwnership,
} = require("../utils/fileValidation");

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
 * @param {Object} [deps]
 * @returns {Promise<number>}
 */
const countActiveUserFiles = async (userId, deps = {}) => {
    const FileModel = deps.File || File;
    return await FileModel.countDocuments({
        userId,
        isDeleted: { $ne: true },
    });
};

/**
 * Counts the soft-deleted files in the Recycle Bin for a given user.
 * @param {string} userId
 * @param {Object} [deps]
 * @returns {Promise<number>}
 */
const countDeletedUserFiles = async (userId, deps = {}) => {
    const FileModel = deps.File || File;
    return await FileModel.countDocuments({
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
 * Accepts fileId or fileName or { fileId, fileName } object.
 *
 * @param {string|Object} identifier
 * @param {string} userId
 * @param {Object} [options]
 * @param {string} [options.originalFolder]
 * @param {number} [options.retentionDays]
 * @param {Object} [deps]
 * @returns {Promise<{ file: Object, alreadyDeleted: boolean }>}
 */
const softDeleteFile = async (identifier, userId, options = {}, deps = {}) => {
    if (!userId) {
        const error = new Error("User ID is required");
        error.status = 401;
        throw error;
    }

    const FileModel = deps.File || File;
    let file = null;

    if (typeof identifier === "object" && identifier !== null) {
        const targetId = identifier.fileId;
        const targetName = identifier.fileName;
        const folder = identifier.originalFolder || options.originalFolder;

        if (targetId) {
            if (!isValidObjectId(targetId) && !targetName) {
                const error = new Error("Invalid file ID format");
                error.status = 400;
                throw error;
            }
            if (isValidObjectId(targetId)) {
                file = await FileModel.findOne({ _id: targetId, userId });
            }
        }

        if (!file && targetName) {
            file = await FileModel.findOne({ fileName: targetName, userId });
        }

        if (folder) {
            options = { ...options, originalFolder: folder };
        }
    } else if (typeof identifier === "string") {
        if (isValidObjectId(identifier)) {
            file = await FileModel.findOne({ _id: identifier, userId });
        }
        if (!file) {
            file = await FileModel.findOne({ fileName: identifier, userId });
        }
    } else {
        const error = new Error("Invalid file identifier provided");
        error.status = 400;
        throw error;
    }

    assertFileOwnership(file, userId);

    if (file.isDeleted) {
        return { file, alreadyDeleted: true };
    }

    const now = new Date();
    const retentionDays = options.retentionDays || DEFAULT_RETENTION_DAYS;

    file.isDeleted = true;
    file.deletedAt = now;
    file.deletionExpiresAt = calculateRetentionExpiry(now, retentionDays);
    file.deletedBy = userId;
    file.updatedAt = now;

    if (options.originalFolder !== undefined) {
        file.originalFolder = options.originalFolder;
    }

    await file.save();

    return { file, alreadyDeleted: false };
};

/**
 * Lists all soft-deleted files in the Recycle Bin for the authenticated user.
 * Enriches each item with retention countdown and version count.
 *
 * @param {string} userId
 * @param {Object} [deps]
 * @returns {Promise<Array<Object>>}
 */
const listRecycleBinFiles = async (userId, deps = {}) => {
    if (!userId) {
        const error = new Error("User ID is required");
        error.status = 401;
        throw error;
    }

    const FileModel = deps.File || File;
    const FileVersionModel = deps.FileVersion || FileVersion;

    const files = await FileModel.find({ userId, isDeleted: true })
        .sort({ deletedAt: -1 })
        .lean();

    if (!files || files.length === 0) {
        return [];
    }

    const now = Date.now();
    const enrichedFiles = await Promise.all(
        files.map(async (f) => {
            const expiresAt = f.deletionExpiresAt
                ? new Date(f.deletionExpiresAt).getTime()
                : calculateRetentionExpiry(f.deletedAt || now).getTime();

            const daysRemaining = Math.max(
                0,
                Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24))
            );

            let versionCount = f.totalVersions || 1;
            try {
                if (FileVersionModel && typeof FileVersionModel.countDocuments === "function") {
                    const count = await FileVersionModel.countDocuments({
                        fileId: f._id,
                        userId,
                    });
                    if (count > 0) {
                        versionCount = count;
                    }
                }
            } catch (err) {
                console.error(`Error counting versions for file ${f._id}:`, err);
            }

            return {
                _id: f._id,
                fileName: f.fileName,
                originalName: f.originalName,
                size: f.size,
                mimetype: f.mimetype,
                category: f.category || "Other",
                tags: f.tags || [],
                summary: f.summary || null,
                isDeleted: true,
                deletedAt: f.deletedAt,
                deletionExpiresAt: f.deletionExpiresAt,
                deletedBy: f.deletedBy,
                daysRemaining,
                versionCount,
                originalFolder: f.originalFolder || "/",
                createdAt: f.createdAt,
                updatedAt: f.updatedAt,
            };
        })
    );

    return enrichedFiles;
};

/**
 * Restores a soft-deleted file back to the active workspace.
 * Resolves naming conflicts and enforces active quota limits.
 *
 * @param {string} fileId
 * @param {string} userId
 * @param {Object} [deps]
 * @returns {Promise<{ file: Object, renamed: boolean, restoredName: string, alreadyActive: boolean }>}
 */
const restoreFileFromTrash = async (fileId, userId, deps = {}) => {
    if (!isValidObjectId(fileId)) {
        const error = new Error("Invalid file ID format");
        error.status = 400;
        throw error;
    }

    const FileModel = deps.File || File;
    const file = await FileModel.findOne({ _id: fileId, userId });
    assertFileOwnership(file, userId);

    if (!file.isDeleted) {
        return {
            file,
            renamed: false,
            restoredName: file.originalName,
            alreadyActive: true,
        };
    }

    // Verify user active quota
    const activeCount = await countActiveUserFiles(userId, deps);
    if (activeCount >= MAX_ACTIVE_FILES_PER_USER) {
        const error = new Error(`Cannot restore: active file quota of ${MAX_ACTIVE_FILES_PER_USER} reached`);
        error.status = 400;
        throw error;
    }

    // Check for naming collisions in active files
    const activeFiles = await FileModel.find({
        userId,
        isDeleted: { $ne: true },
    }).select("originalName").lean();

    const activeNames = (activeFiles || []).map((f) => f.originalName);
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

/**
 * Permanently deletes a single soft-deleted file from the Recycle Bin.
 * Cascades cleanup across Supabase Storage, FileVersion records, DocumentChunk records,
 * and the primary File document.
 *
 * @param {string} fileId
 * @param {string} userId
 * @param {Object} [deps]
 * @returns {Promise<{ success: boolean, deletedFileId: string, deletedStoragePaths: Array<string>, versionCount: number, message: string }>}
 */
const permanentlyDeleteFile = async (fileId, userId, deps = {}) => {
    if (!isValidObjectId(fileId)) {
        const error = new Error("Invalid file ID format");
        error.status = 400;
        throw error;
    }

    const FileModel = deps.File || File;
    const FileVersionModel = deps.FileVersion || FileVersion;
    const DocumentChunkModel = deps.DocumentChunk || DocumentChunk;
    const supabaseClient = deps.supabase || supabase;

    const file = await FileModel.findOne({ _id: fileId, userId });
    assertFileOwnership(file, userId);

    if (!file.isDeleted) {
        const error = new Error("File must be in the Recycle Bin to be permanently deleted");
        error.status = 400;
        throw error;
    }

    // Find all FileVersion records for this file
    const versions = await FileVersionModel.find({ fileId, userId }).lean();

    // Collect all storage paths to purge
    const rawPaths = [];
    if (file.supabasePath) {
        rawPaths.push(file.supabasePath);
    } else if (file.fileName) {
        rawPaths.push(`${userId}/${file.fileName}`);
    }

    versions.forEach((v) => {
        if (v.storagePath) {
            rawPaths.push(v.storagePath);
        }
    });

    const storagePaths = Array.from(
        new Set(rawPaths.filter((p) => validateStoragePath(userId, p)))
    );

    // Delete objects from Supabase storage first
    if (storagePaths.length > 0) {
        const { data, error } = await supabaseClient.storage
            .from("Files-upload")
            .remove(storagePaths);

        if (error) {
            const storageErr = new Error(`Failed to delete storage objects: ${error.message}`);
            storageErr.status = 502;
            throw storageErr;
        }
    }

    // Cascade delete database records
    if (DocumentChunkModel && typeof DocumentChunkModel.deleteMany === "function") {
        await DocumentChunkModel.deleteMany({ fileId, userId });
    }
    if (FileVersionModel && typeof FileVersionModel.deleteMany === "function") {
        await FileVersionModel.deleteMany({ fileId, userId });
    }
    await FileModel.deleteOne({ _id: fileId, userId });

    return {
        success: true,
        deletedFileId: String(fileId),
        deletedStoragePaths: storagePaths,
        versionCount: versions.length,
        message: "File permanently deleted from Recycle Bin",
    };
};

/**
 * Empties the entire Recycle Bin for the authenticated user.
 * Cascades cleanup across Supabase Storage, all FileVersion records,
 * all DocumentChunk records, and all soft-deleted File documents.
 *
 * @param {string} userId
 * @param {Object} [deps]
 * @returns {Promise<{ success: boolean, count: number, deletedCount: number, deletedFileIds: Array<string>, deletedStoragePathsCount: number, message: string }>}
 */
const emptyRecycleBin = async (userId, deps = {}) => {
    if (!userId) {
        const error = new Error("User ID is required");
        error.status = 401;
        throw error;
    }

    const FileModel = deps.File || File;
    const FileVersionModel = deps.FileVersion || FileVersion;
    const DocumentChunkModel = deps.DocumentChunk || DocumentChunk;
    const supabaseClient = deps.supabase || supabase;

    const trashedFiles = await FileModel.find({ userId, isDeleted: true });

    if (!trashedFiles || trashedFiles.length === 0) {
        return {
            success: true,
            count: 0,
            deletedCount: 0,
            deletedFileIds: [],
            deletedStoragePathsCount: 0,
            message: "Recycle Bin is already empty",
        };
    }

    const fileIds = trashedFiles.map((f) => f._id);

    // Find all version records for all trashed files
    const versions = await FileVersionModel.find({
        fileId: { $in: fileIds },
        userId,
    }).lean();

    // Collect all storage paths
    const rawPaths = [];
    trashedFiles.forEach((f) => {
        if (f.supabasePath) {
            rawPaths.push(f.supabasePath);
        } else if (f.fileName) {
            rawPaths.push(`${userId}/${f.fileName}`);
        }
    });

    versions.forEach((v) => {
        if (v.storagePath) {
            rawPaths.push(v.storagePath);
        }
    });

    const storagePaths = Array.from(
        new Set(rawPaths.filter((p) => validateStoragePath(userId, p)))
    );

    // Delete storage objects from Supabase in batch
    if (storagePaths.length > 0) {
        const { data, error } = await supabaseClient.storage
            .from("Files-upload")
            .remove(storagePaths);

        if (error) {
            const storageErr = new Error(`Failed to remove storage objects during empty recycle bin: ${error.message}`);
            storageErr.status = 502;
            throw storageErr;
        }
    }

    // Cascade delete database records
    if (DocumentChunkModel && typeof DocumentChunkModel.deleteMany === "function") {
        await DocumentChunkModel.deleteMany({ fileId: { $in: fileIds }, userId });
    }
    if (FileVersionModel && typeof FileVersionModel.deleteMany === "function") {
        await FileVersionModel.deleteMany({ fileId: { $in: fileIds }, userId });
    }
    const deleteResult = await FileModel.deleteMany({
        _id: { $in: fileIds },
        userId,
        isDeleted: true,
    });

    const deletedCount = deleteResult.deletedCount !== undefined
        ? deleteResult.deletedCount
        : trashedFiles.length;

    return {
        success: true,
        count: deletedCount,
        deletedCount,
        deletedFileIds: fileIds.map(String),
        deletedStoragePathsCount: storagePaths.length,
        message: "Recycle Bin emptied successfully",
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
    listRecycleBinFiles,
    restoreFileFromTrash,
    permanentlyDeleteFile,
    emptyRecycleBin,
};
