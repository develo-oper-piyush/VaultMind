const express = require("express");
const supabase = require("../config/supabase");
const authMiddleware = require("../middlewares/auth.middleware");
const File = require("../models/file.model");
const DocumentChunk = require("../models/documentChunk.model");
const {
    extractDocument,
    extractTextFromBuffer,
    extractKeywords,
} = require("../utils/textExtractor");
const { chunkDocument } = require("../utils/chunkingEngine");
const ragConfig = require("../config/ragConfig");
const { generateTagsAndCategory } = require("../utils/aiTagger");
const { generateSummary } = require("../utils/aiSummarizer");
const { searchFiles } = require("../utils/searchEngine");
const {
    validateUploadFile,
    MAX_FILE_SIZE,
    SUPPORTED_DOCUMENT_EXTENSIONS,
} = require("../utils/fileValidator");
const { retrieveRelevantChunks } = require("../utils/retrievalEngine");
const { duplicateService } = require("../utils/duplicateService");
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

        // Filter out the .emptyFolderPlaceholder and version directories
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
                originalName: meta.originalName || file.name,
                fullPath: `${userId}/${file.name}`,
                url: `${baseUrl}/files/secure-file/${encodeURIComponent(file.name)}`,
                createdAt: file.created_at,
                size: file.metadata?.size || meta.size || 0,
                mimetype: file.metadata?.mimetype || meta.mimetype || "unknown",
                chunkCount: meta.chunkCount || 0,
                tags: meta.tags || [],
                category: meta.category || "Other",
                summary: meta.summary || null,
                processingStatus: meta.processingStatus || {
                    textExtracted: false,
                    chunked: false,
                    indexed: false,
                    tagged: false,
                    summarized: false,
                    error: null,
                },
                _id: meta._id || null,
                currentVersion: meta.currentVersion || 1,
                totalVersions: meta.totalVersions || 1,
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

// Background document processing: Text Extraction, Chunking & AI Analysis
const processFileInBackground = async (fileDoc, fileBuffer) => {
    try {
        console.log(`Starting background processing for file: ${fileDoc.fileName}`);

        // 1. Extract clean text and per-page metadata
        const extraction = await extractDocument(
            fileBuffer,
            fileDoc.mimetype,
            fileDoc.originalName
        );

        if (!extraction.success || !extraction.text) {
            console.warn(`Text extraction note for ${fileDoc.fileName}:`, extraction.error);
            await File.findByIdAndUpdate(fileDoc._id, {
                "processingStatus.textExtracted": false,
                "processingStatus.chunked": false,
                "processingStatus.indexed": false,
                "processingStatus.error": extraction.error || "No readable text content found.",
                updatedAt: Date.now(),
            });
            return;
        }

        const textContent = extraction.text;
        const keywords = extractKeywords(textContent);

        // 2. Generate sliding-window overlapping chunks with page metadata
        const chunks = chunkDocument(extraction, {
            chunkSize: ragConfig.CHUNK_SIZE,
            chunkOverlap: ragConfig.CHUNK_OVERLAP,
        });

        // 3. Persist document chunks to MongoDB (idempotent: purge previous chunks if any)
        await DocumentChunk.deleteMany({ fileId: fileDoc._id });

        if (chunks.length > 0) {
            const chunkDocs = chunks.map((c) => ({
                userId: fileDoc.userId,
                fileId: fileDoc._id,
                fileName: fileDoc.fileName,
                originalName: fileDoc.originalName,
                chunkIndex: c.chunkIndex,
                text: c.text,
                pageNumber: c.pageNumber,
                charStart: c.charStart,
                charEnd: c.charEnd,
                keywords: extractKeywords(c.text),
                metadata: {
                    mimetype: fileDoc.mimetype,
                    size: fileDoc.size,
                    totalPages: extraction.pageCount,
                },
            }));

            await DocumentChunk.insertMany(chunkDocs);
            console.log(`Successfully stored ${chunkDocs.length} chunks for ${fileDoc.fileName}`);
        }

        // 4. Update file with extracted content and chunking status
        await File.findByIdAndUpdate(fileDoc._id, {
            textContent,
            keywords,
            chunkCount: chunks.length,
            "processingStatus.textExtracted": true,
            "processingStatus.chunked": true,
            "processingStatus.indexed": true,
            updatedAt: Date.now(),
        });

        console.log(`Text extracted and indexed for file: ${fileDoc.fileName}`);

        // 5. Run AI tagging and summarization in parallel
        const [taggingResult, summary] = await Promise.all([
            generateTagsAndCategory(fileDoc.originalName, fileDoc.mimetype, textContent),
            generateSummary(textContent),
        ]);

        // 6. Update with final AI results
        await File.findByIdAndUpdate(fileDoc._id, {
            tags: taggingResult.tags || [],
            category: taggingResult.category || "Other",
            summary: summary,
            "processingStatus.tagged": true,
            "processingStatus.summarized": true,
            "processingStatus.error": taggingResult.error || null,
            updatedAt: Date.now(),
        });

        console.log(`Document processing completed successfully for: ${fileDoc.fileName}`);
    } catch (error) {
        console.error(`Background document processing error for ${fileDoc.fileName}:`, error);
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
            return res.status(400).json({
                success: false,
                error: "No file uploaded. Please select a valid document or file.",
            });
        }

        const file = req.files.file;
        const userId = req.user.userId;

        // Perform rigorous file validation (size, MIME, extension, empty buffer, path traversal)
        const validation = validateUploadFile(file);
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                error: validation.error,
            });
        }

        // Check current active file count (excluding soft-deleted items in Recycle Bin)
        const activeFileCount = await countActiveUserFiles(userId);

        if (activeFileCount >= MAX_FILES_PER_USER) {
            return res.status(400).json({
                success: false,
                error: `Maximum file limit of ${MAX_FILES_PER_USER} reached. Please delete an older file to upload a new one.`,
            });
        }

        // Authoritative duplicate detection check against existing user files
        const uploadCheck = await duplicateService.validateUpload(
            userId,
            {
                name: validation.sanitizedName,
                originalName: validation.sanitizedName,
                size: file.size,
                mimetype: file.mimetype,
            },
            req.body?.allowDuplicate
        );

        if (!uploadCheck.allowed) {
            return res.status(409).json(uploadCheck);
        }

        const fileName = `${Date.now()}-${validation.sanitizedName}`;
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
            return res.status(500).json({
                success: false,
                error: "Error uploading file to storage provider.",
            });
        }

        // Create MongoDB document with initial metadata
        const fileDoc = await File.create({
            userId,
            fileName,
            originalName: validation.sanitizedName,
            supabasePath: filePath,
            mimetype: file.mimetype,
            size: file.size,
            processingStatus: {
                textExtracted: false,
                chunked: false,
                indexed: false,
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
                originalName: validation.sanitizedName,
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

        res.status(201).json({
            success: true,
            message: "File uploaded successfully and queued for processing",
            file: fileDoc,
            isDocument: validation.isDocument,
            duplicateWarning: uploadCheck.warning || null,
        });
    } catch (error) {
        console.error("Upload error:", error);
        res.status(500).json({
            success: false,
            error: "An unexpected server error occurred during upload.",
        });
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
        const { oldFileName, newFileName, fileId, allowDuplicate } = req.body;
        const userId = req.user.userId;

        if (!oldFileName || !newFileName) {
            return res
                .status(400)
                .json({ error: "Both old and new file names are required" });
        }

        // Check file record & prevent renaming soft-deleted files
        let targetFileDoc = null;
        if (fileId) {
            targetFileDoc = await File.findOne({ _id: fileId, userId });
        } else {
            targetFileDoc = await File.findOne({ fileName: oldFileName, userId });
        }

        if (targetFileDoc && targetFileDoc.isDeleted) {
            return res.status(400).json({ error: "Cannot rename a file that is in the Recycle Bin" });
        }

        // Check duplicate collision for rename
        try {
            if (targetFileDoc && !allowDuplicate) {
                const renameCheck = await duplicateService.validateRename(
                    userId,
                    targetFileDoc._id,
                    newFileName.trim()
                );

                if (!renameCheck.allowed) {
                    return res.status(409).json({
                        success: false,
                        isDuplicate: true,
                        confidenceLevel: renameCheck.confidenceLevel,
                        highestScore: renameCheck.highestScore,
                        error: `Rename conflict: '${newFileName.trim()}' matches existing file in your vault with ${renameCheck.confidenceLevel} confidence.`,
                        duplicates: renameCheck.checkResult?.duplicates || [],
                    });
                }
            }
        } catch (dbErr) {
            console.warn("Rename duplicate pre-check warning:", dbErr.message);
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

        // Synchronize MongoDB File record with new names
        if (targetFileDoc) {
            try {
                targetFileDoc.fileName = sanitizedNewName;
                targetFileDoc.originalName = newFileName.trim();
                targetFileDoc.supabasePath = newPath;
                targetFileDoc.updatedAt = new Date();
                await targetFileDoc.save();
            } catch (syncErr) {
                console.warn("MongoDB record update error during rename:", syncErr.message);
            }
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

        // Perform semantic search (excludes soft-deleted files)
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

        const mongoose = require("mongoose");
        let query = { userId, isDeleted: { $ne: true } };
        if (mongoose.Types.ObjectId.isValid(fileId)) {
            query._id = fileId;
        } else {
            query.fileName = fileId;
        }

        const file = await File.findOne(query).lean();

        if (!file) {
            return res.status(404).json({ success: false, error: "File not found" });
        }

        res.json({
            success: true,
            _id: file._id,
            fileName: file.fileName,
            originalName: file.originalName || file.fileName,
            mimetype: file.mimetype,
            size: file.size,
            chunkCount: file.chunkCount || 0,
            processingStatus: file.processingStatus || {
                textExtracted: false,
                chunked: false,
                indexed: false,
                tagged: false,
                summarized: false,
                error: null,
            },
            tags: file.tags || [],
            category: file.category || "Other",
            summary: file.summary || null,
            updatedAt: file.updatedAt,
        });
    } catch (error) {
        console.error("File status error:", error);
        res.status(500).json({ success: false, error: "Failed to fetch file status" });
    }
});

// Supported formats and upload constraints endpoint
router.get(["/supported-formats", "/api/supported-formats"], (req, res) => {
    res.json({
        success: true,
        supportedDocumentExtensions: SUPPORTED_DOCUMENT_EXTENSIONS,
        maxFileSizeMB: MAX_FILE_SIZE / (1024 * 1024),
        maxFilesPerUser: MAX_FILES_PER_USER,
    });
});

// Chunks route for inspecting indexed document chunks
router.get(["/chunks/:fileId", "/api/files/chunks/:fileId"], authMiddleware, async (req, res) => {
    try {
        const { fileId } = req.params;
        const userId = req.user.userId;

        const mongoose = require("mongoose");
        let query = { userId };
        if (mongoose.Types.ObjectId.isValid(fileId)) {
            query.fileId = fileId;
        } else {
            query.fileName = fileId;
        }

        const chunks = await DocumentChunk.find(query).sort({ chunkIndex: 1 }).lean();

        res.json({
            success: true,
            fileId,
            totalChunks: chunks.length,
            chunks,
        });
    } catch (error) {
        console.error("Fetch chunks error:", error);
        res.status(500).json({ success: false, error: "Failed to fetch document chunks" });
    }
});

// Retrieve relevant document chunks endpoint (RAG Phase 1 / Semantic search)
router.post(["/retrieve", "/api/files/retrieve", "/api/chat/retrieve"], authMiddleware, async (req, res) => {
    try {
        const { query, fileFilters, topK, minScore } = req.body;
        const userId = req.user.userId;

        if (!query || query.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: "Search query is required.",
            });
        }

        const retrievalResult = await retrieveRelevantChunks(userId, query.trim(), {
            fileFilters: Array.isArray(fileFilters) ? fileFilters : undefined,
            topK: topK ? parseInt(topK, 10) : undefined,
            minScore: minScore !== undefined ? parseFloat(minScore) : undefined,
        });

        res.json({
            success: true,
            query: retrievalResult.query,
            totalFound: retrievalResult.totalFound,
            sufficientContext: retrievalResult.sufficientContext,
            chunks: retrievalResult.chunks,
        });
    } catch (error) {
        console.error("Retrieval endpoint error:", error);
        res.status(500).json({
            success: false,
            error: "Failed to retrieve relevant document chunks.",
        });
    }
});

/**
 * Smart Duplicate Detection Endpoints (Day 4)
 */

// Pre-screening duplicate checking endpoint for upload & rename workflows
router.post(
    ["/check-duplicate", "/api/files/check-duplicate"],
    authMiddleware,
    async (req, res) => {
        try {
            const { originalName, size, mimetype, category, excludeFileId } = req.body;
            const userId = req.user.userId;

            if (!originalName || typeof originalName !== "string" || originalName.trim().length === 0) {
                return res.status(400).json({
                    success: false,
                    error: "originalName is required and must be a non-empty string.",
                });
            }

            if (size === undefined || size === null || isNaN(Number(size)) || Number(size) < 0) {
                return res.status(400).json({
                    success: false,
                    error: "size is required and must be a non-negative number in bytes.",
                });
            }

            const checkResult = await duplicateService.checkDuplicates(
                userId,
                {
                    originalName: originalName.trim(),
                    size: Number(size),
                    mimetype: mimetype || null,
                    category: category || null,
                },
                { excludeFileId }
            );

            return res.json(checkResult);
        } catch (error) {
            console.error("Check duplicate error:", error);
            return res.status(500).json({
                success: false,
                error: "Internal server error checking file duplicates.",
            });
        }
    }
);

// Audit user storage vault for duplicate clusters and recoverable quota
router.get(
    ["/duplicates", "/api/files/duplicates"],
    authMiddleware,
    async (req, res) => {
        try {
            const userId = req.user.userId;
            const auditResult = await duplicateService.scanUserVault(userId);
            return res.json(auditResult);
        } catch (error) {
            console.error("Audit duplicates error:", error);
            return res.status(500).json({
                success: false,
                error: "Failed to audit user storage vault for duplicates.",
            });
        }
    }
);

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
