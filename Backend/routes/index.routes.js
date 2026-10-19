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

        // Filter out the .emptyFolderPlaceholder if it exists
        const actualFiles = files.filter(
            (file) => file.name !== ".emptyFolderPlaceholder"
        );

        // Fetch MongoDB metadata for files
        const fileMetadata = await File.find({ userId }).lean();
        const metadataMap = {};
        fileMetadata.forEach((meta) => {
            metadataMap[meta.fileName] = meta;
        });

        // Use internal secure routes instead of direct Supabase URLs
        const baseUrl = process.env.BACKEND_URL || "http://localhost:5000";
        const filesWithUrls = actualFiles.map((file) => {
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
                keywords: c.keywords,
                metadata: c.metadata,
            }));
            await DocumentChunk.insertMany(chunkDocs);
        }

        console.log(`Extracted and indexed ${chunks.length} chunks for: ${fileDoc.fileName}`);

        // Update File with extraction & chunking progress
        await File.findByIdAndUpdate(fileDoc._id, {
            textContent,
            keywords,
            chunkCount: chunks.length,
            "processingStatus.textExtracted": true,
            "processingStatus.chunked": true,
            updatedAt: Date.now(),
        });

        // 4. Run AI tagging and summarization in parallel
        const [taggingResult, summary] = await Promise.all([
            generateTagsAndCategory(fileDoc.originalName, fileDoc.mimetype, textContent),
            generateSummary(textContent),
        ]);

        // 5. Update with final AI results & mark as indexed
        await File.findByIdAndUpdate(fileDoc._id, {
            tags: taggingResult.tags || [],
            category: taggingResult.category || "Other",
            summary: summary,
            "processingStatus.tagged": true,
            "processingStatus.summarized": true,
            "processingStatus.indexed": true,
            "processingStatus.error": taggingResult.error || null,
            updatedAt: Date.now(),
        });

        console.log(`Full document processing & indexing completed for: ${fileDoc.fileName}`);
    } catch (error) {
        console.error(`Background processing error for ${fileDoc.fileName}:`, error);
        await File.findByIdAndUpdate(fileDoc._id, {
            "processingStatus.error": error.message,
            updatedAt: Date.now(),
        });
    }
};

// Upload file route with comprehensive validation
router.post("/upload-file", authMiddleware, async (req, res) => {
    try {
        if (!req.files || !req.files.file) {
            return res.status(400).json({
                success: false,
                error: "No file uploaded. Please select a file to upload.",
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

        // Check current file count limit
        const { data: existingFiles, error: listError } = await supabase.storage
            .from("Files-upload")
            .list(userId);

        if (listError) {
            console.error("Error checking file count:", listError);
            return res.status(500).json({
                success: false,
                error: "Error verifying storage quota. Please try again.",
            });
        }

        const actualFileCount = existingFiles.filter(
            (f) => f.name !== ".emptyFolderPlaceholder"
        ).length;

        if (actualFileCount >= MAX_FILES_PER_USER) {
            return res.status(400).json({
                success: false,
                error: `Maximum file limit of ${MAX_FILES_PER_USER} reached. Please delete an older file to upload a new one.`,
            });
        }

        // Prevent duplicate processing if file with same name and size exists for user
        const existingDoc = await File.findOne({
            userId,
            originalName: validation.sanitizedName,
            size: file.size,
        });

        if (existingDoc) {
            return res.status(409).json({
                success: false,
                error: `Duplicate file detected: '${validation.sanitizedName}' (${(file.size / 1024).toFixed(1)} KB) has already been uploaded.`,
                file: existingDoc,
            });
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
                error: "Cloud storage upload failed. Please try again.",
            });
        }

        // Create MongoDB document with initial metadata & RAG tracking fields
        const fileDoc = await File.create({
            userId,
            fileName,
            originalName: validation.sanitizedName,
            supabasePath: filePath,
            mimetype: file.mimetype,
            size: file.size,
            chunkCount: 0,
            processingStatus: {
                textExtracted: false,
                chunked: false,
                indexed: false,
                tagged: false,
                summarized: false,
                error: null,
            },
        });

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
        });
    } catch (error) {
        console.error("Upload error:", error);
        res.status(500).json({
            success: false,
            error: "An unexpected server error occurred during upload.",
        });
    }
});

// Delete file route
router.post("/delete-file", authMiddleware, async (req, res) => {
    try {
        const { fileName } = req.body;
        const userId = req.user.userId;

        if (!fileName) {
            console.error("No file name provided in request");
            return res.status(400).json({ error: "No file name provided" });
        }

        // Construct the full file path
        const filePath = `${userId}/${fileName}`;

        console.log("=== DELETE FILE ATTEMPT ===");
        console.log("User ID:", userId);
        console.log("File Name:", fileName);
        console.log("Full File Path:", filePath);
        console.log("Bucket:", "Files-upload");

        // First, check if the file exists
        const { data: existingFiles, error: listError } = await supabase.storage
            .from("Files-upload")
            .list(userId);

        if (listError) {
            console.error("Error listing files:", listError);
        } else {
            console.log(
                "Files in user folder:",
                existingFiles.map((f) => f.name)
            );
            const fileExists = existingFiles.some((f) => f.name === fileName);
            console.log("File exists in folder:", fileExists);
        }

        // Attempt to delete the file
        const { data, error } = await supabase.storage
            .from("Files-upload")
            .remove([filePath]);

        if (error) {
            console.error("=== DELETE ERROR ===");
            console.error("Error object:", JSON.stringify(error, null, 2));
            console.error("Error message:", error.message);
            console.error("Error status:", error.status);
            return res.status(500).json({
                error: "Error deleting file",
                details: error.message,
                path: filePath,
            });
        }

        console.log("=== DELETE SUCCESS ===");
        console.log("Delete response data:", data);

        // Delete associated MongoDB document and indexed chunks
        const fileDoc = await File.findOne({ userId, fileName });
        if (fileDoc) {
            const deleteChunksResult = await DocumentChunk.deleteMany({ fileId: fileDoc._id, userId });
            console.log(`Cleaned up ${deleteChunksResult.deletedCount} indexed chunks for ${fileName}`);
            await File.deleteOne({ _id: fileDoc._id });
            console.log("MongoDB document deleted");
        } else {
            await File.deleteOne({ userId, fileName });
        }

        // Verify deletion
        const { data: afterDelete, error: verifyError } = await supabase.storage
            .from("Files-upload")
            .list(userId);

        if (!verifyError) {
            const stillExists = afterDelete.some((f) => f.name === fileName);
            console.log("File still exists after delete:", stillExists);
        }

        res.json({
            success: true,
            message: "File deleted successfully",
            deletedPath: filePath,
            data,
        });
    } catch (error) {
        console.error("=== EXCEPTION IN DELETE ===");
        console.error("Exception:", error);
        res.status(500).json({ error: "Server error", details: error.message });
    }
});

// Secure file view route - generates a new signed URL
router.get("/view-file/:fileName", authMiddleware, async (req, res) => {
    try {
        const { fileName } = req.params;
        const userId = req.user.userId;
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
        const filePath = `${userId}/${decodeURIComponent(fileName)}`;

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
            (f) => f.name === decodeURIComponent(fileName)
        );
        const contentType =
            fileMetadata?.metadata?.mimetype || "application/octet-stream";

        // Set headers and send file
        res.setHeader("Content-Type", contentType);
        res.setHeader(
            "Content-Disposition",
            `inline; filename="${decodeURIComponent(fileName)}"`
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

        const mongoose = require("mongoose");
        let query = { userId };
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

module.exports = router;
