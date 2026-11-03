const mongoose = require("mongoose");

/**
 * Validates whether a given string is a valid MongoDB ObjectId.
 * @param {string} id
 * @returns {boolean}
 */
const isValidObjectId = (id) => {
    if (!id || typeof id !== "string") return false;
    return mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === id;
};

/**
 * Sanitizes a filename by removing path traversal patterns and unsafe characters.
 * @param {string} filename
 * @returns {string}
 */
const sanitizeFilename = (filename) => {
    if (!filename || typeof filename !== "string") {
        return "unnamed_file";
    }
    // Remove directory traversal tokens and backslashes/slashes
    const baseName = filename.replace(/^.*[\\\/]/, "");
    // Replace non-alphanumeric, dot, dash, underscore with underscore
    const sanitized = baseName.replace(/[^a-zA-Z0-9._-]/g, "_");
    return sanitized || "unnamed_file";
};

/**
 * Validates that a storage path is safely contained within the user's namespace
 * and does not contain path traversal attempts.
 * @param {string} userId
 * @param {string} storagePath
 * @returns {boolean}
 */
const validateStoragePath = (userId, storagePath) => {
    if (!userId || !storagePath || typeof storagePath !== "string") {
        return false;
    }
    // Disallow directory traversal sequences
    if (storagePath.includes("..") || storagePath.includes("\\") || storagePath.startsWith("/")) {
        return false;
    }
    // Must start with userId/
    const expectedPrefix = `${userId}/`;
    return storagePath.startsWith(expectedPrefix);
};

/**
 * Asserts that a file document exists and belongs to the specified userId.
 * Throws an error with a status code property if unauthorized or not found.
 * @param {Object} fileDoc
 * @param {string} userId
 */
const assertFileOwnership = (fileDoc, userId) => {
    if (!fileDoc) {
        const error = new Error("File not found");
        error.status = 404;
        throw error;
    }
    if (String(fileDoc.userId) !== String(userId)) {
        // Return 404 to avoid leaking file existence to unauthorized users
        const error = new Error("File not found");
        error.status = 404;
        throw error;
    }
};

module.exports = {
    isValidObjectId,
    sanitizeFilename,
    validateStoragePath,
    assertFileOwnership,
};
