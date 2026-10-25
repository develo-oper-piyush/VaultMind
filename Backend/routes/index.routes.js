const express = require("express");
const supabase = require("../config/supabase");
const authMiddleware = require("../middlewares/auth.middleware");
const File = require("../models/file.model");
const {
    extractTextFromBuffer,
    extractKeywords,
} = require("../utils/textExtractor");
const { generateTagsAndCategory } = require("../utils/aiTagger");
const { generateSummary } = require("../utils/aiSummarizer");
const { searchFiles } = require("../utils/searchEngine");
const {
    computeContentHash,
    createFileVersionRecord,
    uploadFileVersion,
    listVersionsForFile,
    downloadHistoricalVersion,
    restoreFileVersion,
} = require("../services/version.service");
const {
    DEFAULT_RETENTION_DAYS,
    MAX_ACTIVE_FILES_PER_USER,
    countActiveUserFiles,
    softDeleteFile,
    listRecycleBinFiles,
    restoreFileFromTrash,
    permanentlyDeleteFile,
    emptyRecycleBin,
} = require("../services/recycleBin.service");
const { isValidObjectId } = require("../utils/fileValidation");

const router = express.Router();

// Constants for limits
const MAX_FILES_PER_USER = 12;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB in bytes

router.get("/", (req, res) => {
    res.json({ message: "API is running. Please use the frontend application." });
});

router.get("/home", authMiddleware, async (req, res) => {
    try {
        const userId = req.user.userId;

        // Fetch all files from Supabase bucket in user's folder
        const { data: files, error } = await supabase.storage
            .from("Files-upload")
            .list(userId, {
                limit: 100,
                offset: 0,
                sortBy: { column: "name", order: "asc" },
            });

        if (error) {
            console.error("Error fetching files:", error);
            return res.json({
                success: true,
                files: [],
                user: req.user,
                fileCount: 0,
                maxFiles: MAX_FILES_PER_USER,
                maxFileSize: MAX_FILE_SIZE / (1024 * 1024),
            });
        }

        // Filter out .emptyFolderPlaceholder and version directories
        const actualFiles = files.filter(
            (file) => file.name !== ".emptyFolderPlaceholder" && file.name !== "versions"
        );

        // Fetch MongoDB metadata for files
        const fileMetadata = await File.find({ userId }).lean();
        const metadataMap = {};
        fileMetadata.forEach((meta) => {
            metadataMap[meta.fileName] = meta;
        });

        // Filter out soft-deleted files from active listing
        const activeFiles = actualFiles.filter((file) => {
            const meta = metadataMap[file.name];
            if (meta && meta.isDeleted === true) {
                return false;
            }
            return true;
        });

        // Use internal secure routes instead of direct Supabase URLs
        const baseUrl = process.env.BACKEND_URL || "http://localhost:5000";
        const filesWithUrls = activeFiles.map((file) => {
            const meta = metadataMap[file.name] || {};
            return {
                name: file.name,
                fullPath: `${userId}/${file.name}`,
                url: `${baseUrl}/files/secure-file/${encodeURIComponent(file.name)}`,
                createdAt: file.created_at,
                size: file.metadata?.size || meta.size || 0,
                mimetype: file.metadata?.mimetype || meta.mimetype || "unknown",
                tags: meta.tags || [],
                category: meta.category || "Other",
                summary: meta.summary || null,
                processingStatus: meta.processingStatus || {
                    textExtracted: false,
                    tagged: false,
                    summarized: false,
                },
                _id: meta._id || null,
                currentVersion: meta.currentVersion || 1,
                totalVersions: meta.totalVersions || 1,
                originalName: meta.originalName || file.name,
            };
        });

        console.log(`Found ${filesWithUrls.length} files for user ${userId}`);
        res.json({
            success: true,
            files: filesWithUrls,
            user: req.user,
            fileCount: filesWithUrls.length,
            maxFiles: MAX_FILES_PER_USER,
            maxFileSize: MAX_FILE_SIZE / (1024 * 1024),
        });
    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({
            success: false,
            error: "Failed to fetch files",
            files: [],
            user: req.user,
            fileCount: 0,
            maxFiles: MAX_FILES_PER_USER,
            maxFileSize: MAX_FILE_SIZE / (1024 * 1024),
        });
    }
});

// Background AI processing function
const processFileInBackground = async (fileDoc, fileBuffer) => {
    try {
        console.log(`Starting background processing for file: ${fileDoc.fileName}`);

        // Extract text content
        const textContent = await extractTextFromBuffer(
            fileBuffer,
            fileDoc.mimetype
        );
        const keywords = extractKeywords(textContent);

        await File.findByIdAndUpdate(fileDoc._id, {
            textContent,
            keywords,
            "processingStatus.textExtracted": true,
            updatedAt: Date.now(),
        });

        console.log(`Text extracted for file: ${fileDoc.fileName}`);

        // Run AI tagging and summarization in parallel
        const [taggingResult, summary] = await Promise.all([
            generateTagsAndCategory(fileDoc.originalName, fileDoc.mimetype, textContent),
            generateSummary(textContent),
        ]);

        // Update with AI results
        await File.findByIdAndUpdate(fileDoc._id, {
            tags: taggingResult.tags || [],
            category: taggingResult.category || "Other",
            summary: summary,
            "processingStatus.tagged": true,
            "processingStatus.summarized": true,
            "processingStatus.error": taggingResult.error || null,
            updatedAt: Date.now(),
        });

        console.log(`AI processing completed for file: ${fileDoc.fileName}`);
    } catch (error) {
        console.error(`Background processing error for ${fileDoc.fileName}:`, error);
        await File.findByIdAndUpdate(fileDoc._id, {
            "processingStatus.error": error.message,
            updatedAt: Date.now(),
        });
    }
};

// Upload file route
router.post("/upload-file", authMiddleware, async (req, res) => {
    try {
        if (!req.files || !req.files.file) {
            return res.status(400).send("No file uploaded");
        }

        const file = req.files.file;
        const userId = req.user.userId;

        // Check file size limit (5MB)
        if (file.size > MAX_FILE_SIZE) {
            return res
                .status(400)
                .send(
                    `File size exceeds limit of ${
                        MAX_FILE_SIZE / (1024 * 1024)
                    }MB`
                );
        }

        // Check current active file count (excluding soft-deleted items)
        const activeFileCount = await countActiveUserFiles(userId);

        if (activeFileCount >= MAX_FILES_PER_USER) {
            return res
                .status(400)
                .send(`Maximum file limit of ${MAX_FILES_PER_USER} reached`);
        }

        const fileName = `${Date.now()}-${file.name}`;
        const filePath = `${userId}/${fileName}`; // Store in user-specific folder

        // Upload to Supabase storage
        const { data, error } = await supabase.storage
            .from("Files-upload")
            .upload(filePath, file.data, {
                contentType: file.mimetype,
                upsert: false,
            });

        if (error) {
            console.error("Supabase upload error:", error);
            return res.status(500).send("Error uploading file");
        }

        // Create MongoDB document with initial metadata
        const fileDoc = await File.create({
            userId,
            fileName,
            originalName: file.name,
            supabasePath: filePath,
            mimetype: file.mimetype,
            size: file.size,
            processingStatus: {
                textExtracted: false,
                tagged: false,
                summarized: false,
                error: null,
            },
        });

        // Create initial FileVersion record for version history
        try {
            const hash = computeContentHash(file.data);
            await createFileVersionRecord({
                fileId: fileDoc._id,
                userId,
                versionNumber: 1,
                originalName: file.name,
                storagePath: filePath,
                mimetype: file.mimetype,
                size: file.size,
                contentHash: hash,
                changeSummary: "Initial version",
                createdBy: userId,
            });
        } catch (versionErr) {
            console.error("Failed to create initial version record:", versionErr);
        }

        console.log("File uploaded successfully:", data);

        // Trigger background processing (fire-and-forget)
        processFileInBackground(fileDoc, file.data).catch((err) => {
            console.error("Background processing failed:", err);
        });

        res.json({
            success: true,
            message: "File uploaded successfully",
            file: fileDoc,
        });
    } catch (error) {
        console.error("Upload error:", error);
        res.status(500).send("Server error");
    }
});

// Delete file route - updated to Soft Delete (moves to Recycle Bin)
router.post(["/delete-file", "/files/delete-file"], authMiddleware, async (req, res) => {
    try {
        const { fileName, fileId } = req.body || {};
        const userId = req.user.userId;

        if (!fileName && !fileId) {
            return res.status(400).json({ error: "No file identifier provided" });
        }

        const identifier = fileId || fileName;
        const result = await softDeleteFile(identifier, userId);

        return res.json({
            success: true,
            message: result.alreadyDeleted
                ? "File is already in Recycle Bin"
                : "File moved to Recycle Bin successfully",
            file: {
                _id: result.file._id,
                fileName: result.file.fileName,
                originalName: result.file.originalName,
                isDeleted: result.file.isDeleted,
                deletedAt: result.file.deletedAt,
                deletionExpiresAt: result.file.deletionExpiresAt,
                deletedBy: result.file.deletedBy,
            },
        });
    } catch (error) {
        console.error("Delete file error:", error);
        return res.status(error.status || 500).json({
            success: false,
            error: error.message || "Failed to delete file",
        });
    }
});

// Explicit soft delete by fileId
router.post(
    ["/:fileId/trash", "/files/:fileId/trash", "/recycle-bin/:fileId/trash"],
    authMiddleware,
    async (req, res) => {
        try {
            const { fileId } = req.params;
            const userId = req.user.userId;

            if (!isValidObjectId(fileId)) {
                return res.status(400).json({
                    success: false,
                    error: "Invalid file ID format",
                });
            }

            const result = await softDeleteFile(fileId, userId);

            return res.json({
                success: true,
                message: result.alreadyDeleted
                    ? "File is already in Recycle Bin"
                    : "File moved to Recycle Bin successfully",
                file: {
                    _id: result.file._id,
                    fileName: result.file.fileName,
                    originalName: result.file.originalName,
                    isDeleted: result.file.isDeleted,
                    deletedAt: result.file.deletedAt,
                    deletionExpiresAt: result.file.deletionExpiresAt,
                    deletedBy: result.file.deletedBy,
                },
            });
        } catch (error) {
            console.error("Trash file error:", error);
            return res.status(error.status || 500).json({
                success: false,
                error: error.message || "Failed to move file to Recycle Bin",
            });
        }
    }
);

// Secure file view route - generates a new signed URL
router.get("/view-file/:fileName", authMiddleware, async (req, res) => {
    try {
        const { fileName } = req.params;
        const userId = req.user.userId;

        // Ensure soft-deleted files are not accessible
        const fileDoc = await File.findOne({ userId, fileName }).lean();
        if (fileDoc && fileDoc.isDeleted) {
            return res.status(404).send("File not found");
        }

        const filePath = `${userId}/${fileName}`;

        // Create a signed URL that expires in 5 minutes
        const { data, error } = await supabase.storage
            .from("Files-upload")
            .createSignedUrl(filePath, 300); // 5 minutes

        if (error) {
            console.error("Error creating signed URL:", error);
            return res.status(404).send("File not found");
        }

        // Redirect to the signed URL
        res.redirect(data.signedUrl);
    } catch (error) {
        console.error("Error viewing file:", error);
        res.status(500).send("Server error");
    }
});

// Secure file serving route - requires authentication and ownership verification
router.get("/secure-file/:fileName", authMiddleware, async (req, res) => {
    try {
        const { fileName } = req.params;
        const userId = req.user.userId;
        const decodedFileName = decodeURIComponent(fileName);

        // Ensure soft-deleted files are not accessible
        const fileDoc = await File.findOne({ userId, fileName: decodedFileName }).lean();
        if (fileDoc && fileDoc.isDeleted) {
            return res.status(404).send("File not found");
        }

        const filePath = `${userId}/${decodedFileName}`;

        console.log(`User ${userId} requesting file: ${filePath}`);

        // Download file from Supabase
        const { data, error } = await supabase.storage
            .from("Files-upload")
            .download(filePath);

        if (error) {
            console.error("Error downloading file:", error);
            return res.status(404).send("File not found");
        }

        // Get file metadata to set proper content type
        const { data: fileList } = await supabase.storage
            .from("Files-upload")
            .list(userId);

        const fileMetadata = fileList?.find(
            (f) => f.name === decodedFileName
        );
        const contentType =
            fileMetadata?.metadata?.mimetype || fileDoc?.mimetype || "application/octet-stream";

        // Set headers and send file
        res.setHeader("Content-Type", contentType);
        res.setHeader(
            "Content-Disposition",
            `inline; filename="${decodedFileName}"`
        );

        // Convert blob to buffer and send
        const buffer = Buffer.from(await data.arrayBuffer());
        res.send(buffer);
    } catch (error) {
        console.error("Error serving secure file:", error);
        res.status(500).send("Server error");
    }
});

// Rename file route
router.post("/rename-file", authMiddleware, async (req, res) => {
    try {
        const { oldFileName, newFileName } = req.body;
        const userId = req.user.userId;

        if (!oldFileName || !newFileName) {
            return res
                .status(400)
                .json({ error: "Both old and new file names are required" });
        }

        // Prevent renaming a soft-deleted file in Recycle Bin
        const fileDoc = await File.findOne({ userId, fileName: oldFileName });
        if (fileDoc && fileDoc.isDeleted) {
            return res.status(400).json({ error: "Cannot rename a file that is in the Recycle Bin" });
        }

        // Sanitize new file name (keep the timestamp prefix from old file)
        const timestampMatch = oldFileName.match(/^(\d+)-/);
        const timestamp = timestampMatch ? timestampMatch[1] : Date.now();
        const sanitizedNewName = `${timestamp}-${newFileName.replace(
            /[^a-zA-Z0-9._-]/g,
            "_"
        )}`;

        const oldPath = `${userId}/${oldFileName}`;
        const newPath = `${userId}/${sanitizedNewName}`;

        console.log(`Renaming file from ${oldPath} to ${newPath}`);

        // Download the file first
        const { data: fileData, error: downloadError } = await supabase.storage
            .from("Files-upload")
            .download(oldPath);

        if (downloadError) {
            console.error("Error downloading file for rename:", downloadError);
            return res.status(404).json({ error: "File not found" });
        }

        // Get file metadata
        const { data: fileList } = await supabase.storage
            .from("Files-upload")
            .list(userId);

        const fileMetadata = fileList?.find((f) => f.name === oldFileName);
        const contentType =
            fileMetadata?.metadata?.mimetype || "application/octet-stream";

        // Upload with new name
        const buffer = Buffer.from(await fileData.arrayBuffer());
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from("Files-upload")
            .upload(newPath, buffer, {
                contentType: contentType,
                upsert: false,
            });

        if (uploadError) {
            console.error("Error uploading renamed file:", uploadError);
            return res.status(500).json({ error: "Error renaming file" });
        }

        // Delete old file
        const { error: deleteError } = await supabase.storage
            .from("Files-upload")
            .remove([oldPath]);

        if (deleteError) {
            console.error("Error deleting old file:", deleteError);
            // Try to clean up the new file
            await supabase.storage.from("Files-upload").remove([newPath]);
            return res.status(500).json({ error: "Error completing rename" });
        }

        if (fileDoc) {
            fileDoc.fileName = sanitizedNewName;
            fileDoc.supabasePath = newPath;
            fileDoc.updatedAt = new Date();
            await fileDoc.save();
        }

        res.json({
            success: true,
            message: "File renamed successfully",
            newFileName: sanitizedNewName,
        });
    } catch (error) {
        console.error("Error renaming file:", error);
        res.status(500).json({ error: "Server error" });
    }
});

// Search route
router.post("/search", authMiddleware, async (req, res) => {
    try {
        const { query } = req.body;
        const userId = req.user.userId;

        if (!query || query.trim().length === 0) {
            return res.json({ results: [] });
        }

        // Perform semantic search
        const results = await searchFiles(userId, query.trim());

        // Fetch Supabase metadata for URLs
        const baseUrl = process.env.BACKEND_URL || "http://localhost:5000";
        const resultsWithUrls = results.map((file) => ({
            _id: file._id,
            name: file.fileName,
            originalName: file.originalName,
            url: `${baseUrl}/files/secure-file/${encodeURIComponent(file.fileName)}`,
            mimetype: file.mimetype,
            size: file.size,
            tags: file.tags || [],
            category: file.category || "Other",
            summary: file.summary || null,
            score: file.score,
            createdAt: file.createdAt,
            processingStatus: file.processingStatus,
        }));

        res.json({ results: resultsWithUrls });
    } catch (error) {
        console.error("Search error:", error);
        res.status(500).json({ error: "Search failed" });
    }
});

// File status route for polling
router.get(["/file-status/:fileId", "/api/file-status/:fileId"], authMiddleware, async (req, res) => {
    try {
        const { fileId } = req.params;
        const userId = req.user.userId;

        if (!isValidObjectId(fileId)) {
            return res.status(400).json({ error: "Invalid file ID format" });
        }

        const file = await File.findOne({ _id: fileId, userId, isDeleted: { $ne: true } }).lean();

        if (!file) {
            return res.status(404).json({ error: "File not found" });
        }

        res.json({
            _id: file._id,
            fileName: file.fileName,
            processingStatus: file.processingStatus,
            tags: file.tags,
            category: file.category,
            summary: file.summary,
        });
    } catch (error) {
        console.error("File status error:", error);
        res.status(500).json({ error: "Failed to fetch file status" });
    }
});

// ==========================================
// File Version History Endpoints (Day 3)
// ==========================================

// 1. Upload a new file version
router.post(["/:fileId/version", "/:fileId/versions"], authMiddleware, async (req, res) => {
    try {
        const { fileId } = req.params;
        const userId = req.user.userId;

        if (!req.files || !req.files.file) {
            return res.status(400).json({
                success: false,
                error: "No file uploaded",
            });
        }

        const uploadedFile = req.files.file;
        const changeSummary = req.body?.changeSummary || req.body?.comment || "Updated file content";

        const result = await uploadFileVersion({
            fileId,
            userId,
            file: uploadedFile,
            changeSummary,
        });

        // Trigger background AI processing asynchronously (fire-and-forget)
        processFileInBackground(result.file, uploadedFile.data).catch((err) => {
            console.error(`Background AI processing error for new version of ${result.file.fileName}:`, err);
        });

        return res.status(201).json({
            success: true,
            message: "File version uploaded successfully",
            version: {
                _id: result.version._id,
                fileId: result.version.fileId,
                versionNumber: result.version.versionNumber,
                originalName: result.version.originalName,
                size: result.version.size,
                mimetype: result.version.mimetype,
                contentHash: result.version.contentHash,
                changeSummary: result.version.changeSummary,
                createdAt: result.version.createdAt,
            },
            file: {
                _id: result.file._id,
                currentVersion: result.file.currentVersion,
                totalVersions: result.file.totalVersions,
                originalName: result.file.originalName,
                size: result.file.size,
                mimetype: result.file.mimetype,
                updatedAt: result.file.updatedAt,
            },
        });
    } catch (error) {
        console.error("Upload version error:", error);
        return res.status(error.status || 500).json({
            success: false,
            error: error.message || "Failed to upload file version",
        });
    }
});

// 2. List all versions for a file
router.get(["/:fileId/versions", "/:fileId/version"], authMiddleware, async (req, res) => {
    try {
        const { fileId } = req.params;
        const userId = req.user.userId;

        const { file, versions } = await listVersionsForFile(fileId, userId);

        return res.json({
            success: true,
            fileId: file._id,
            currentVersion: file.currentVersion || 1,
            totalVersions: file.totalVersions || versions.length || 1,
            count: versions.length,
            versions: versions.map((v) => ({
                _id: v._id,
                fileId: v.fileId,
                versionNumber: v.versionNumber,
                originalName: v.originalName,
                size: v.size,
                mimetype: v.mimetype,
                contentHash: v.contentHash,
                changeSummary: v.changeSummary,
                summarySnapshot: v.summarySnapshot,
                tagsSnapshot: v.tagsSnapshot,
                createdBy: v.createdBy,
                createdAt: v.createdAt,
            })),
        });
    } catch (error) {
        console.error("List versions error:", error);
        return res.status(error.status || 500).json({
            success: false,
            error: error.message || "Failed to list file versions",
        });
    }
});

// 3. Download a historical version
router.get(
    ["/:fileId/versions/:versionId/download", "/:fileId/version/:versionId/download"],
    authMiddleware,
    async (req, res) => {
        try {
            const { fileId, versionId } = req.params;
            const userId = req.user.userId;

            const { version, buffer, contentType, filename, size } =
                await downloadHistoricalVersion(fileId, versionId, userId);

            res.setHeader("Content-Type", contentType);
            const encodedFilename = encodeURIComponent(filename).replace(/['()]/g, escape);
            res.setHeader(
                "Content-Disposition",
                `attachment; filename="${filename.replace(/"/g, '\\"')}"; filename*=UTF-8''${encodedFilename}`
            );
            if (size !== undefined && size !== null) {
                res.setHeader("Content-Length", size);
            }

            return res.send(buffer);
        } catch (error) {
            console.error("Download version error:", error);
            return res.status(error.status || 500).json({
                success: false,
                error: error.message || "Failed to download historical version",
            });
        }
    }
);

// 4. Restore a historical version
router.post(
    ["/:fileId/versions/:versionId/restore", "/:fileId/version/:versionId/restore"],
    authMiddleware,
    async (req, res) => {
        try {
            const { fileId, versionId } = req.params;
            const userId = req.user.userId;
            const changeSummary = req.body?.changeSummary;

            const result = await restoreFileVersion({
                fileId,
                versionId,
                userId,
                changeSummary,
            });

            // Trigger background AI processing for restored content
            if (result.buffer) {
                processFileInBackground(result.file, result.buffer).catch((err) => {
                    console.error(`Background AI processing error for restored version of ${result.file.fileName}:`, err);
                });
            }

            return res.json({
                success: true,
                message: `Successfully restored version as version ${result.version.versionNumber}`,
                version: {
                    _id: result.version._id,
                    fileId: result.version.fileId,
                    versionNumber: result.version.versionNumber,
                    originalName: result.version.originalName,
                    size: result.version.size,
                    mimetype: result.version.mimetype,
                    contentHash: result.version.contentHash,
                    changeSummary: result.version.changeSummary,
                    createdAt: result.version.createdAt,
                },
                file: {
                    _id: result.file._id,
                    currentVersion: result.file.currentVersion,
                    totalVersions: result.file.totalVersions,
                    originalName: result.file.originalName,
                    size: result.file.size,
                    mimetype: result.file.mimetype,
                    updatedAt: result.file.updatedAt,
                },
            });
        } catch (error) {
            console.error("Restore version error:", error);
            return res.status(error.status || 500).json({
                success: false,
                error: error.message || "Failed to restore file version",
            });
        }
    }
);

// ==========================================
// Recycle Bin Endpoints (Day 4)
// ==========================================

// 1. List soft-deleted files in Recycle Bin
router.get(["/recycle-bin", "/files/recycle-bin"], authMiddleware, async (req, res) => {
    try {
        const userId = req.user.userId;
        const files = await listRecycleBinFiles(userId);

        return res.json({
            success: true,
            count: files.length,
            files,
        });
    } catch (error) {
        console.error("List recycle bin error:", error);
        return res.status(error.status || 500).json({
            success: false,
            error: error.message || "Failed to list Recycle Bin items",
        });
    }
});

// 2. Empty Recycle Bin (Permanently purge all deleted files for authenticated user)
// NOTE: Registered BEFORE /:fileId routes so /empty is not treated as a :fileId parameter.
router.delete(["/recycle-bin/empty", "/files/recycle-bin/empty"], authMiddleware, async (req, res) => {
    try {
        const userId = req.user.userId;
        const result = await emptyRecycleBin(userId);

        return res.json({
            success: true,
            message: result.message,
            deletedCount: result.deletedCount,
            deletedFileIds: result.deletedFileIds,
            deletedStoragePathsCount: result.deletedStoragePathsCount,
        });
    } catch (error) {
        console.error("Empty recycle bin error:", error);
        return res.status(error.status || 500).json({
            success: false,
            error: error.message || "Failed to empty Recycle Bin",
        });
    }
});

// Fallback POST /empty for clients where DELETE with empty body is not preferred
router.post(["/recycle-bin/empty", "/files/recycle-bin/empty"], authMiddleware, async (req, res) => {
    try {
        const userId = req.user.userId;
        const result = await emptyRecycleBin(userId);

        return res.json({
            success: true,
            message: result.message,
            deletedCount: result.deletedCount,
            deletedFileIds: result.deletedFileIds,
            deletedStoragePathsCount: result.deletedStoragePathsCount,
        });
    } catch (error) {
        console.error("Empty recycle bin error:", error);
        return res.status(error.status || 500).json({
            success: false,
            error: error.message || "Failed to empty Recycle Bin",
        });
    }
});

// 3. Restore a soft-deleted file back to active workspace
router.post(
    ["/recycle-bin/:fileId/restore", "/files/recycle-bin/:fileId/restore", "/:fileId/restore", "/files/:fileId/restore"],
    authMiddleware,
    async (req, res) => {
        try {
            const { fileId } = req.params;
            const userId = req.user.userId;

            if (!isValidObjectId(fileId)) {
                return res.status(400).json({
                    success: false,
                    error: "Invalid file ID format",
                });
            }

            const result = await restoreFileFromTrash(fileId, userId);

            return res.json({
                success: true,
                message: result.alreadyActive
                    ? "File is already active"
                    : result.renamed
                    ? `File restored successfully as "${result.restoredName}" to resolve name conflict`
                    : "File restored successfully",
                renamed: result.renamed || false,
                restoredName: result.restoredName,
                alreadyActive: result.alreadyActive || false,
                file: {
                    _id: result.file._id,
                    fileName: result.file.fileName,
                    originalName: result.file.originalName,
                    isDeleted: result.file.isDeleted,
                    deletedAt: result.file.deletedAt,
                    updatedAt: result.file.updatedAt,
                },
            });
        } catch (error) {
            console.error("Restore file error:", error);
            return res.status(error.status || 500).json({
                success: false,
                error: error.message || "Failed to restore file from Recycle Bin",
            });
        }
    }
);

// 4. Permanently delete a specific trashed file
router.delete(
    ["/recycle-bin/:fileId", "/files/recycle-bin/:fileId"],
    authMiddleware,
    async (req, res) => {
        try {
            const { fileId } = req.params;
            const userId = req.user.userId;

            if (!isValidObjectId(fileId)) {
                return res.status(400).json({
                    success: false,
                    error: "Invalid file ID format",
                });
            }

            const result = await permanentlyDeleteFile(fileId, userId);

            return res.json({
                success: true,
                message: result.message,
                deletedFileId: result.deletedFileId,
                deletedStoragePaths: result.deletedStoragePaths,
            });
        } catch (error) {
            console.error("Permanent delete error:", error);
            return res.status(error.status || 500).json({
                success: false,
                error: error.message || "Failed to permanently delete file",
            });
        }
    }
);

module.exports = router;
