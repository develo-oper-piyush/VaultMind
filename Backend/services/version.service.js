const crypto = require("crypto");
const File = require("../models/file.model");
const FileVersion = require("../models/fileVersion.model");
const { sanitizeFilename, validateStoragePath } = require("../utils/fileValidation");

/**
 * Computes SHA-256 hash of a file buffer.
 * @param {Buffer} buffer
 * @returns {string}
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
 * @returns {Promise<number>}
 */
const getNextVersionNumber = async (fileId) => {
    const latestVersionDoc = await FileVersion.findOne({ fileId })
        .sort({ versionNumber: -1 })
        .select("versionNumber")
        .lean();

    if (latestVersionDoc && typeof latestVersionDoc.versionNumber === "number") {
        return latestVersionDoc.versionNumber + 1;
    }

    // Check base file model as fallback
    const fileDoc = await File.findById(fileId).select("currentVersion").lean();
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
 * @returns {Promise<Object>} Created FileVersion document
 */
const createFileVersionRecord = async (params, options = {}) => {
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

    if (!fileId || !userId || !versionNumber || !originalName || !storagePath || !mimetype || size === undefined || !createdBy) {
        throw new Error("Missing required fields for version record creation");
    }

    if (!validateStoragePath(userId, storagePath)) {
        throw new Error("Storage path violates user isolation boundary");
    }

    const versionDoc = new FileVersion({
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
 * @returns {Promise<Object>} FileVersion document
 */
const ensureInitialVersion = async (fileDoc, userId) => {
    if (!fileDoc || !fileDoc._id) {
        throw new Error("Valid file document is required");
    }

    // Check if any version already exists
    const existingVersion = await FileVersion.findOne({
        fileId: fileDoc._id,
        versionNumber: 1,
    });

    if (existingVersion) {
        return existingVersion;
    }

    // Create v1 record matching existing file state
    const initialVersion = new FileVersion({
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

    return await initialVersion.save();
};

/**
 * Fetches all versions for a file, verifying user ownership.
 * @param {string} fileId
 * @param {string} userId
 * @returns {Promise<Array>}
 */
const listVersionsForFile = async (fileId, userId) => {
    // Validate file ownership first
    const file = await File.findOne({ _id: fileId, userId }).lean();
    if (!file) {
        const error = new Error("File not found");
        error.status = 404;
        throw error;
    }

    // Ensure initial version exists for backward compatibility
    const count = await FileVersion.countDocuments({ fileId: file._id });
    if (count === 0) {
        await ensureInitialVersion(file, userId);
    }

    return await FileVersion.find({ fileId: file._id, userId })
        .sort({ versionNumber: -1 })
        .lean();
};

/**
 * Fetches a specific version record, ensuring ownership.
 * @param {string} fileId
 * @param {string} versionId
 * @param {string} userId
 * @returns {Promise<Object>}
 */
const getVersionById = async (fileId, versionId, userId) => {
    const version = await FileVersion.findOne({
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

module.exports = {
    computeContentHash,
    generateVersionStoragePath,
    getNextVersionNumber,
    createFileVersionRecord,
    ensureInitialVersion,
    listVersionsForFile,
    getVersionById,
};
