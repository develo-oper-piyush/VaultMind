const crypto = require("crypto");
const path = require("path");
const supabase = require("../config/supabase");
const File = require("../models/file.model");
const FileVersion = require("../models/fileVersion.model");
const {
    sanitizeFilename,
    validateStoragePath,
    isValidObjectId,
} = require("../utils/fileValidation");

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB in bytes

/**
 * Computes SHA-256 hash of a file buffer.
 * @param {Buffer} buffer
 * @returns {string|null}
 */
const computeContentHash = (buffer) => {
    if (!buffer || !Buffer.isBuffer(buffer)) {
        return null;
    }
    return crypto.createHash("sha256").update(buffer).digest("hex");
};

/**
 * Generates an isolated, safe storage path for a file version.
 * Format: {userId}/versions/{fileId}/v{versionNumber}_{timestamp}-{sanitizedFilename}
 * @param {string} userId
 * @param {string} fileId
 * @param {number} versionNumber
 * @param {string} originalName
 * @returns {string}
 */
const generateVersionStoragePath = (userId, fileId, versionNumber, originalName) => {
    if (!userId || !fileId || !versionNumber) {
        throw new Error("userId, fileId, and versionNumber are required to generate storage path");
    }
    const cleanFilename = sanitizeFilename(originalName);
    const timestamp = Date.now();
    const storagePath = `${userId}/versions/${fileId}/v${versionNumber}_${timestamp}-${cleanFilename}`;

    if (!validateStoragePath(userId, storagePath)) {
        throw new Error("Generated storage path violates path security boundaries");
    }

    return storagePath;
};

/**
 * Determines the next version number for a file.
 * Checks the latest FileVersion document, falling back to File.currentVersion or 1.
 * @param {string|mongoose.Types.ObjectId} fileId
 * @param {Object} [deps]
 * @returns {Promise<number>}
 */
const getNextVersionNumber = async (fileId, deps = {}) => {
    const FileVersionModel = deps.FileVersion || FileVersion;
    const FileModel = deps.File || File;

    const latestVersionDoc = await FileVersionModel.findOne({ fileId })
        .sort({ versionNumber: -1 })
        .select("versionNumber")
        .lean();

    if (latestVersionDoc && typeof latestVersionDoc.versionNumber === "number") {
        return latestVersionDoc.versionNumber + 1;
    }

    // Check base file model as fallback
    const fileDoc = await FileModel.findById(fileId).select("currentVersion").lean();
    if (fileDoc && typeof fileDoc.currentVersion === "number") {
        return fileDoc.currentVersion + 1;
    }

    return 1;
};

/**
 * Creates and persists a new FileVersion record in MongoDB.
 * @param {Object} params
 * @param {string} params.fileId
 * @param {string} params.userId
 * @param {number} params.versionNumber
 * @param {string} params.originalName
 * @param {string} params.storagePath
 * @param {string} params.mimetype
 * @param {number} params.size
 * @param {string} [params.contentHash]
 * @param {string} [params.changeSummary]
 * @param {string} [params.summarySnapshot]
 * @param {Array<string>} [params.tagsSnapshot]
 * @param {string} params.createdBy
 * @param {Object} [options]
 * @param {Object} [deps]
 * @returns {Promise<Object>} Created FileVersion document
 */
const createFileVersionRecord = async (params, options = {}, deps = {}) => {
    const FileVersionModel = deps.FileVersion || FileVersion;
    const {
        fileId,
        userId,
        versionNumber,
        originalName,
        storagePath,
        mimetype,
        size,
        contentHash = null,
        changeSummary = "Updated file content",
        summarySnapshot = null,
        tagsSnapshot = [],
        createdBy,
    } = params;

    if (
        !fileId ||
        !userId ||
        !versionNumber ||
        !originalName ||
        !storagePath ||
        !mimetype ||
        size === undefined ||
        !createdBy
    ) {
        throw new Error("Missing required fields for version record creation");
    }

    if (!validateStoragePath(userId, storagePath)) {
        throw new Error("Storage path violates user isolation boundary");
    }

    const versionDoc = new FileVersionModel({
        fileId,
        userId,
        versionNumber,
        originalName: originalName.trim(),
        storagePath: storagePath.trim(),
        mimetype: mimetype.trim(),
        size,
        contentHash,
        changeSummary: changeSummary ? changeSummary.trim().slice(0, 300) : "Updated file content",
        summarySnapshot,
        tagsSnapshot: Array.isArray(tagsSnapshot) ? tagsSnapshot : [],
        createdBy: String(createdBy).trim(),
    });

    return await versionDoc.save(options);
};

/**
 * Ensures backward compatibility: if an existing file lacks a Version 1 record,
 * creates one lazily from the existing file metadata.
 * @param {Object} fileDoc
 * @param {string} userId
 * @param {Object} [deps]
 * @returns {Promise<Object>} FileVersion document
 */
const ensureInitialVersion = async (fileDoc, userId, deps = {}) => {
    if (!fileDoc || !fileDoc._id) {
        throw new Error("Valid file document is required");
    }

    const FileVersionModel = deps.FileVersion || FileVersion;

    // Check if any version already exists
    const existingVersion = await FileVersionModel.findOne({
        fileId: fileDoc._id,
        versionNumber: 1,
    });

    if (existingVersion) {
        return existingVersion;
    }

    // Create v1 record matching existing file state
    const initialVersion = new FileVersionModel({
        fileId: fileDoc._id,
        userId: userId || fileDoc.userId,
        versionNumber: 1,
        originalName: fileDoc.originalName || fileDoc.fileName,
        storagePath: fileDoc.supabasePath || `${userId}/${fileDoc.fileName}`,
        mimetype: fileDoc.mimetype || "application/octet-stream",
        size: fileDoc.size || 0,
        contentHash: null,
        changeSummary: "Initial version",
        summarySnapshot: fileDoc.summary || null,
        tagsSnapshot: fileDoc.tags || [],
        createdBy: userId || fileDoc.userId,
        createdAt: fileDoc.createdAt || new Date(),
    });

    try {
        return await initialVersion.save();
    } catch (err) {
        // Defensive check: if another request created version 1 concurrently, return it
        if (err.code === 11000) {
            return await FileVersionModel.findOne({
                fileId: fileDoc._id,
                versionNumber: 1,
            });
        }
        throw err;
    }
};

/**
 * Fetches all versions for a file, ensuring ownership and lazy initial version backfill.
 * @param {string} fileId
 * @param {string} userId
 * @param {Object} [deps]
 * @returns {Promise<{ file: Object, versions: Array }>}
 */
const listVersionsForFile = async (fileId, userId, deps = {}) => {
    if (!isValidObjectId(fileId)) {
        const error = new Error("Invalid file ID format");
        error.status = 400;
        throw error;
    }

    const FileModel = deps.File || File;
    const FileVersionModel = deps.FileVersion || FileVersion;

    // Validate file ownership first
    const file = await FileModel.findOne({ _id: fileId, userId }).lean();
    if (!file) {
        const error = new Error("File not found");
        error.status = 404;
        throw error;
    }

    // Ensure initial version exists for backward compatibility
    const count = await FileVersionModel.countDocuments({ fileId: file._id, userId });
    if (count === 0) {
        await ensureInitialVersion(file, userId, deps);
    }

    const versions = await FileVersionModel.find({ fileId: file._id, userId })
        .sort({ versionNumber: -1 })
        .select("-storagePath")
        .lean();

    return {
        file,
        versions,
    };
};

/**
 * Fetches a specific version record, ensuring ownership.
 * @param {string} fileId
 * @param {string} versionId
 * @param {string} userId
 * @param {Object} [deps]
 * @returns {Promise<Object>}
 */
const getVersionById = async (fileId, versionId, userId, deps = {}) => {
    if (!isValidObjectId(fileId) || !isValidObjectId(versionId)) {
        const error = new Error("Invalid file ID or version ID format");
        error.status = 400;
        throw error;
    }

    const FileVersionModel = deps.FileVersion || FileVersion;
    const version = await FileVersionModel.findOne({
        _id: versionId,
        fileId,
        userId,
    }).lean();

    if (!version) {
        const error = new Error("Version not found");
        error.status = 404;
        throw error;
    }

    return version;
};

/**
 * Uploads a new file version to Supabase Storage, creates a FileVersion record,
 * and updates File metadata using optimistic concurrency control.
 *
 * @param {Object} params
 * @param {string} params.fileId
 * @param {string} params.userId
 * @param {Object} params.file - Uploaded file object { name, data, mimetype, size }
 * @param {string} [params.changeSummary]
 * @param {Object} [deps]
 * @returns {Promise<{ version: Object, file: Object }>}
 */
const uploadFileVersion = async (params, deps = {}) => {
    const { fileId, userId, file, changeSummary } = params;

    if (!isValidObjectId(fileId)) {
        const error = new Error("Invalid file ID format");
        error.status = 400;
        throw error;
    }

    if (!file || !file.data) {
        const error = new Error("No file uploaded");
        error.status = 400;
        throw error;
    }

    if (file.size > MAX_FILE_SIZE) {
        const error = new Error(`File size exceeds limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
        error.status = 400;
        throw error;
    }

    const FileModel = deps.File || File;
    const FileVersionModel = deps.FileVersion || FileVersion;
    const supabaseClient = deps.supabase || supabase;

    // Verify parent file exists and belongs to user
    const fileDoc = await FileModel.findOne({ _id: fileId, userId });
    if (!fileDoc) {
        const error = new Error("File not found");
        error.status = 404;
        throw error;
    }

    // Reject upload if file is soft-deleted
    if (fileDoc.isDeleted) {
        const error = new Error("Cannot upload a new version of a file in the Recycle Bin. Please restore the file first.");
        error.status = 400;
        throw error;
    }

    // Ensure initial version exists for legacy/unversioned files
    await ensureInitialVersion(fileDoc, userId, deps);

    // Determine next sequential version number
    const nextVersion = await getNextVersionNumber(fileDoc._id, deps);

    // Generate safe storage path within user namespace
    const storagePath = generateVersionStoragePath(userId, String(fileDoc._id), nextVersion, file.name);

    // Upload new version binary to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabaseClient.storage
        .from("Files-upload")
        .upload(storagePath, file.data, {
            contentType: file.mimetype || "application/octet-stream",
            upsert: false,
        });

    if (uploadError) {
        const error = new Error(`Failed to upload version to storage: ${uploadError.message || "Storage error"}`);
        error.status = 500;
        throw error;
    }

    // Compute SHA-256 hash of new version content
    const contentHash = computeContentHash(file.data);

    // Create FileVersion metadata document
    let versionDoc;
    try {
        versionDoc = await createFileVersionRecord({
            fileId: fileDoc._id,
            userId,
            versionNumber: nextVersion,
            originalName: file.name,
            storagePath,
            mimetype: file.mimetype || "application/octet-stream",
            size: file.size,
            contentHash,
            changeSummary: changeSummary || "Updated file content",
            createdBy: userId,
        }, {}, deps);
    } catch (dbErr) {
        // Compensating rollback: clean up newly created storage object
        try {
            await supabaseClient.storage.from("Files-upload").remove([storagePath]);
        } catch (cleanupErr) {
            console.error("Compensating cleanup failed after version creation error:", cleanupErr);
        }
        throw dbErr;
    }

    // Atomically update File metadata with optimistic concurrency check
    const updatedFile = await FileModel.findOneAndUpdate(
        {
            _id: fileDoc._id,
            userId,
            currentVersion: fileDoc.currentVersion,
            isDeleted: { $ne: true },
        },
        {
            $set: {
                fileName: path.basename(storagePath),
                originalName: file.name,
                supabasePath: storagePath,
                mimetype: file.mimetype || fileDoc.mimetype,
                size: file.size,
                currentVersion: nextVersion,
                totalVersions: Math.max(fileDoc.totalVersions || 1, nextVersion),
                updatedAt: new Date(),
                "processingStatus.textExtracted": false,
                "processingStatus.tagged": false,
                "processingStatus.summarized": false,
                "processingStatus.error": null,
            },
        },
        { new: true }
    );

    if (!updatedFile) {
        // Concurrency conflict occurred! Clean up newly created version and storage object
        try {
            await FileVersionModel.deleteOne({ _id: versionDoc._id });
            await supabaseClient.storage.from("Files-upload").remove([storagePath]);
        } catch (cleanupErr) {
            console.error("Cleanup error during version upload concurrency conflict:", cleanupErr);
        }
        const conflictErr = new Error("A concurrent update occurred. Please refresh and try again.");
        conflictErr.status = 409;
        throw conflictErr;
    }

    return {
        version: versionDoc,
        file: updatedFile,
    };
};

/**
 * Downloads a historical version binary from storage after ownership and path verification.
 *
 * @param {string} fileId
 * @param {string} versionId
 * @param {string} userId
 * @param {Object} [deps]
 * @returns {Promise<{ version: Object, buffer: Buffer, contentType: string, filename: string, size: number }>}
 */
const downloadHistoricalVersion = async (fileId, versionId, userId, deps = {}) => {
    if (!isValidObjectId(fileId) || !isValidObjectId(versionId)) {
        const error = new Error("Invalid file ID or version ID format");
        error.status = 400;
        throw error;
    }

    const FileModel = deps.File || File;
    const FileVersionModel = deps.FileVersion || FileVersion;
    const supabaseClient = deps.supabase || supabase;

    // Verify parent file exists and belongs to user
    const file = await FileModel.findOne({ _id: fileId, userId }).lean();
    if (!file) {
        const error = new Error("File not found");
        error.status = 404;
        throw error;
    }

    // Verify version exists and belongs to this file and user
    const version = await FileVersionModel.findOne({
        _id: versionId,
        fileId: file._id,
        userId,
    }).lean();

    if (!version) {
        const error = new Error("Version not found");
        error.status = 404;
        throw error;
    }

    // Validate storage path against user boundary
    if (!validateStoragePath(userId, version.storagePath)) {
        const error = new Error("Invalid storage path boundary");
        error.status = 403;
        throw error;
    }

    // Download historical binary from Supabase Storage
    const { data, error } = await supabaseClient.storage
        .from("Files-upload")
        .download(version.storagePath);

    if (error || !data) {
        const err = new Error("Historical file content not found in storage");
        err.status = 404;
        throw err;
    }

    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(await data.arrayBuffer());

    return {
        version,
        buffer,
        contentType: version.mimetype || "application/octet-stream",
        filename: version.originalName,
        size: version.size,
    };
};

/**
 * Restores a historical version by copying its content into a brand new version,
 * preserving audit history and updating File metadata non-destructively.
 *
 * @param {Object} params
 * @param {string} params.fileId
 * @param {string} params.versionId
 * @param {string} params.userId
 * @param {string} [params.changeSummary]
 * @param {Object} [deps]
 * @returns {Promise<{ version: Object, file: Object, buffer: Buffer }>}
 */
const restoreFileVersion = async (params, deps = {}) => {
    const { fileId, versionId, userId, changeSummary } = params;

    if (!isValidObjectId(fileId) || !isValidObjectId(versionId)) {
        const error = new Error("Invalid file ID or version ID format");
        error.status = 400;
        throw error;
    }

    const FileModel = deps.File || File;
    const FileVersionModel = deps.FileVersion || FileVersion;
    const supabaseClient = deps.supabase || supabase;

    // Verify parent file exists and belongs to user
    const fileDoc = await FileModel.findOne({ _id: fileId, userId });
    if (!fileDoc) {
        const error = new Error("File not found");
        error.status = 404;
        throw error;
    }

    // Reject restoration if file is soft-deleted
    if (fileDoc.isDeleted) {
        const error = new Error("Cannot restore a version of a file in the Recycle Bin. Please restore the file to active workspace first.");
        error.status = 400;
        throw error;
    }

    // Ensure initial version exists
    await ensureInitialVersion(fileDoc, userId, deps);

    // Verify target version belongs to this file and user
    const targetVersion = await FileVersionModel.findOne({
        _id: versionId,
        fileId: fileDoc._id,
        userId,
    }).lean();

    if (!targetVersion) {
        const error = new Error("Version not found");
        error.status = 404;
        throw error;
    }

    // Reject restoring current active version
    if (fileDoc.currentVersion === targetVersion.versionNumber) {
        const error = new Error(`Version ${targetVersion.versionNumber} is already the current active version`);
        error.status = 400;
        throw error;
    }

    // Validate storage path
    if (!validateStoragePath(userId, targetVersion.storagePath)) {
        const error = new Error("Invalid storage path boundary");
        error.status = 403;
        throw error;
    }

    // Download historical binary
    const { data: historicalData, error: downloadError } = await supabaseClient.storage
        .from("Files-upload")
        .download(targetVersion.storagePath);

    if (downloadError || !historicalData) {
        const err = new Error("Historical file content not found in storage");
        err.status = 404;
        throw err;
    }

    const buffer = Buffer.isBuffer(historicalData) ? historicalData : Buffer.from(await historicalData.arrayBuffer());

    // Determine next sequential version number
    const nextVersion = await getNextVersionNumber(fileDoc._id, deps);

    // Generate isolated storage path for restored version
    const newStoragePath = generateVersionStoragePath(userId, String(fileDoc._id), nextVersion, targetVersion.originalName);

    // Upload restored binary to storage
    const { error: uploadError } = await supabaseClient.storage
        .from("Files-upload")
        .upload(newStoragePath, buffer, {
            contentType: targetVersion.mimetype || "application/octet-stream",
            upsert: false,
        });

    if (uploadError) {
        const err = new Error(`Failed to store restored version content: ${uploadError.message || "Storage error"}`);
        err.status = 500;
        throw err;
    }

    // Create new FileVersion record for the restored version
    let newVersionDoc;
    try {
        newVersionDoc = await createFileVersionRecord({
            fileId: fileDoc._id,
            userId,
            versionNumber: nextVersion,
            originalName: targetVersion.originalName,
            storagePath: newStoragePath,
            mimetype: targetVersion.mimetype || "application/octet-stream",
            size: targetVersion.size || buffer.length,
            contentHash: targetVersion.contentHash || computeContentHash(buffer),
            changeSummary: changeSummary || `Restored from version ${targetVersion.versionNumber}`,
            summarySnapshot: targetVersion.summarySnapshot || null,
            tagsSnapshot: targetVersion.tagsSnapshot || [],
            createdBy: userId,
        }, {}, deps);
    } catch (dbErr) {
        try {
            await supabaseClient.storage.from("Files-upload").remove([newStoragePath]);
        } catch (cleanupErr) {
            console.error("Cleanup error after version creation failure:", cleanupErr);
        }
        throw dbErr;
    }

    // Update File document with optimistic concurrency check
    const updatedFile = await FileModel.findOneAndUpdate(
        {
            _id: fileDoc._id,
            userId,
            currentVersion: fileDoc.currentVersion,
            isDeleted: { $ne: true },
        },
        {
            $set: {
                fileName: path.basename(newStoragePath),
                originalName: targetVersion.originalName,
                supabasePath: newStoragePath,
                mimetype: targetVersion.mimetype || fileDoc.mimetype,
                size: targetVersion.size || buffer.length,
                currentVersion: nextVersion,
                totalVersions: Math.max(fileDoc.totalVersions || 1, nextVersion),
                updatedAt: new Date(),
                "processingStatus.textExtracted": false,
                "processingStatus.tagged": false,
                "processingStatus.summarized": false,
                "processingStatus.error": null,
            },
        },
        { new: true }
    );

    if (!updatedFile) {
        // Concurrency conflict occurred!
        try {
            await FileVersionModel.deleteOne({ _id: newVersionDoc._id });
            await supabaseClient.storage.from("Files-upload").remove([newStoragePath]);
        } catch (cleanupErr) {
            console.error("Cleanup error during restore conflict:", cleanupErr);
        }
        const conflictErr = new Error("A concurrent modification occurred while restoring the file. Please retry.");
        conflictErr.status = 409;
        throw conflictErr;
    }

    return {
        version: newVersionDoc,
        file: updatedFile,
        buffer,
    };
};

module.exports = {
    MAX_FILE_SIZE,
    computeContentHash,
    generateVersionStoragePath,
    getNextVersionNumber,
    createFileVersionRecord,
    ensureInitialVersion,
    listVersionsForFile,
    getVersionById,
    uploadFileVersion,
    downloadHistoricalVersion,
    restoreFileVersion,
};
