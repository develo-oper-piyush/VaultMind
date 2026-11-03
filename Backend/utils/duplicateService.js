const DefaultFileModel = require("../models/file.model");
const duplicateEngine = require("./duplicateEngine");

/**
 * Duplicate Detection Backend Service
 * 
 * Bridges the data-access layer (MongoDB File collection) with the
 * deterministic duplicate matching engine, providing authoritative upload pre-screening,
 * rename conflict detection, and workspace duplicate auditing.
 */
class DuplicateService {
    constructor(fileModel = DefaultFileModel) {
        this.fileModel = fileModel;
    }

    /**
     * Retrieve all candidate files owned by a user from MongoDB
     * 
     * @param {string} userId - User identifier
     * @param {Object} [options] - Optional filters like excludeFileId
     * @returns {Promise<Array<Object>>}
     */
    async getUserFiles(userId, options = {}) {
        if (!userId) {
            return [];
        }

        const query = { userId };
        if (options.excludeFileId) {
            query._id = { $ne: options.excludeFileId };
        }

        const docs = await this.fileModel
            .find(query)
            .select("_id fileName originalName size mimetype category createdAt")
            .sort({ createdAt: -1 });

        return (docs || []).map((doc) => (typeof doc.toObject === "function" ? doc.toObject() : doc));
    }

    /**
     * Authoritatively check whether an incoming file is a duplicate of any existing user file
     * 
     * @param {string} userId - User identifier
     * @param {Object} incomingFile - { originalName, size, mimetype, category }
     * @param {Object} [options] - { excludeFileId }
     * @returns {Promise<Object>}
     */
    async checkDuplicates(userId, incomingFile, options = {}) {
        if (!userId) {
            return {
                success: false,
                error: "User ID is required for duplicate checking.",
                isDuplicate: false,
                confidenceLevel: duplicateEngine.CONFIDENCE_LEVELS.NONE,
                highestScore: 0,
                duplicates: [],
                message: "Missing user credentials.",
            };
        }

        const userFiles = await this.getUserFiles(userId, options);
        const result = duplicateEngine.findDuplicates(incomingFile, userFiles, options);

        return result;
    }

    /**
     * Authoritative backend upload validator:
     * - Returns allowed: true if clean or user explicitly bypassed via allowDuplicate
     * - Returns allowed: false with 409 Conflict payload if exact/high-confidence duplicate is detected
     * 
     * @param {string} userId
     * @param {Object} file - File object from upload ({ name, size, mimetype })
     * @param {boolean|string} allowDuplicate - User override parameter
     * @param {Object} [options]
     */
    async validateUpload(userId, file, allowDuplicate = false, options = {}) {
        const isBypass = allowDuplicate === true || allowDuplicate === "true" || allowDuplicate === "1";

        if (isBypass) {
            return {
                allowed: true,
                bypassed: true,
                isDuplicate: false,
                checkResult: null,
            };
        }

        const incoming = {
            originalName: file.name || file.originalName,
            size: file.size,
            mimetype: file.mimetype,
            category: file.category || null,
        };

        const checkResult = await this.checkDuplicates(userId, incoming, options);

        // If validation error in incoming attributes
        if (!checkResult.success) {
            return {
                allowed: false,
                bypassed: false,
                statusCode: 400,
                error: checkResult.error || "Invalid file attributes for duplicate detection.",
                checkResult,
            };
        }

        // If duplicate detected with EXACT or HIGH confidence, prevent upload unless bypassed
        if (
            checkResult.isDuplicate &&
            (checkResult.confidenceLevel === duplicateEngine.CONFIDENCE_LEVELS.EXACT ||
             checkResult.confidenceLevel === duplicateEngine.CONFIDENCE_LEVELS.HIGH)
        ) {
            const topMatch = checkResult.duplicates[0];
            return {
                allowed: false,
                bypassed: false,
                statusCode: 409,
                isDuplicate: true,
                confidenceLevel: checkResult.confidenceLevel,
                highestScore: checkResult.highestScore,
                error: `Duplicate file detected: '${incoming.originalName}' matches existing file '${topMatch.originalName}' with ${checkResult.confidenceLevel} confidence (${Math.round(topMatch.similarityScore * 100)}% match).`,
                checkResult,
            };
        }

        return {
            allowed: true,
            bypassed: false,
            isDuplicate: checkResult.isDuplicate,
            confidenceLevel: checkResult.confidenceLevel,
            highestScore: checkResult.highestScore,
            checkResult,
        };
    }

    /**
     * Check whether renaming an existing file would collide or create a duplicate
     * 
     * @param {string} userId
     * @param {string} fileId
     * @param {string} newOriginalName
     */
    async validateRename(userId, fileId, newOriginalName) {
        if (!userId || !fileId || !newOriginalName) {
            return {
                success: false,
                error: "userId, fileId, and newOriginalName are required.",
                allowed: false,
            };
        }

        const existingFile = await this.fileModel.findOne({ _id: fileId, userId });
        if (!existingFile) {
            return {
                success: false,
                error: "Target file not found for rename validation.",
                allowed: false,
            };
        }

        const incoming = {
            originalName: newOriginalName,
            size: existingFile.size,
            mimetype: existingFile.mimetype,
            category: existingFile.category,
        };

        const checkResult = await this.checkDuplicates(userId, incoming, {
            excludeFileId: fileId,
        });

        const isExactOrHigh =
            checkResult.isDuplicate &&
            (checkResult.confidenceLevel === duplicateEngine.CONFIDENCE_LEVELS.EXACT ||
             checkResult.confidenceLevel === duplicateEngine.CONFIDENCE_LEVELS.HIGH);

        return {
            success: true,
            allowed: !isExactOrHigh,
            isDuplicate: checkResult.isDuplicate,
            confidenceLevel: checkResult.confidenceLevel,
            highestScore: checkResult.highestScore,
            checkResult,
        };
    }

    /**
     * Audit an entire user vault for all duplicate clusters and calculate potential quota recovery
     * 
     * @param {string} userId
     */
    async scanUserVault(userId) {
        const files = await this.getUserFiles(userId);

        if (files.length <= 1) {
            return {
                success: true,
                fileCount: files.length,
                duplicateGroupCount: 0,
                duplicateGroups: [],
                totalWastedBytes: 0,
                formattedWastedBytes: duplicateEngine.formatBytes(0),
            };
        }

        const visited = new Set();
        const duplicateGroups = [];
        let totalWastedBytes = 0;

        for (let i = 0; i < files.length; i++) {
            const fileA = files[i];
            if (!fileA || typeof fileA !== "object") continue;
            const idA = fileA._id ? String(fileA._id) : (fileA.id ? String(fileA.id) : `file-${i}`);

            if (visited.has(idA)) continue;

            const group = [fileA];

            for (let j = i + 1; j < files.length; j++) {
                const fileB = files[j];
                if (!fileB || typeof fileB !== "object") continue;
                const idB = fileB._id ? String(fileB._id) : (fileB.id ? String(fileB.id) : `file-${j}`);

                if (visited.has(idB)) continue;

                const comp = duplicateEngine.compareFiles(fileA, fileB);
                if (comp.isDuplicate && comp.confidenceLevel !== duplicateEngine.CONFIDENCE_LEVELS.NONE) {
                    group.push(Object.assign({}, fileB, {
                        comparisonScore: comp.similarityScore,
                        comparisonConfidence: comp.confidenceLevel,
                        comparisonReasons: comp.reasons,
                    }));
                    visited.add(idB);
                }
            }

            if (group.length > 1) {
                visited.add(idA);
                // The redundant files in this group contribute to wasted quota
                // Retaining the primary (first uploaded or largest) and counting rest as waste
                let groupWaste = 0;
                for (let k = 1; k < group.length; k++) {
                    groupWaste += (group[k].size || 0);
                }
                totalWastedBytes += groupWaste;

                duplicateGroups.push({
                    primaryFile: group[0],
                    duplicates: group.slice(1),
                    redundantCount: group.length - 1,
                    wastedBytes: groupWaste,
                    formattedWastedBytes: duplicateEngine.formatBytes(groupWaste),
                });
            }
        }

        return {
            success: true,
            fileCount: files.length,
            duplicateGroupCount: duplicateGroups.length,
            duplicateGroups,
            totalWastedBytes,
            formattedWastedBytes: duplicateEngine.formatBytes(totalWastedBytes),
        };
    }
}

const duplicateService = new DuplicateService();

module.exports = {
    DuplicateService,
    duplicateService,
};
