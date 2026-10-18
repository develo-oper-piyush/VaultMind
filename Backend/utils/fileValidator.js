const path = require("path");

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB in bytes

// Supported document MIME types and extensions for Ask VaultMind
const SUPPORTED_DOCUMENT_EXTENSIONS = new Set([
    ".pdf",
    ".docx",
    ".doc",
    ".txt",
    ".md",
    ".csv",
]);

const SUPPORTED_DOCUMENT_MIMES = new Set([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "text/plain",
    "text/markdown",
    "text/csv",
    "application/csv",
]);

// Other general file types supported by the VaultMind workspace storage
const OTHER_SUPPORTED_EXTENSIONS = new Set([
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".svg",
    ".mp4",
    ".webm",
    ".mp3",
    ".wav",
    ".xlsx",
    ".xls",
    ".pptx",
    ".ppt",
]);

/**
 * Sanitize filename to prevent directory traversal and special character injection
 */
const sanitizeFilename = (filename) => {
    if (!filename || typeof filename !== "string") {
        return "unnamed-file";
    }

    // Strip path traversal indicators and null bytes
    const baseName = path.basename(filename).replace(/\0/g, "");

    // Sanitize to safe characters while keeping extension
    const ext = path.extname(baseName).toLowerCase();
    const nameWithoutExt = path.basename(baseName, ext);

    const safeName = nameWithoutExt.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 100);
    return `${safeName || "file"}${ext}`;
};

/**
 * Validate an uploaded file object from express-fileupload
 */
const validateUploadFile = (file) => {
    if (!file) {
        return {
            valid: false,
            error: "No file was provided in the upload request.",
        };
    }

    if (!file.name || typeof file.name !== "string" || file.name.trim().length === 0) {
        return {
            valid: false,
            error: "Invalid file name.",
        };
    }

    // Check for path traversal attacks
    if (file.name.includes("..") || file.name.includes("/") || file.name.includes("\\")) {
        return {
            valid: false,
            error: "File name contains invalid path traversal characters.",
        };
    }

    // Check file data presence
    if (!file.data || !Buffer.isBuffer(file.data)) {
        return {
            valid: false,
            error: "File buffer is missing or corrupted.",
        };
    }

    // Reject empty / 0-byte files
    if (file.size === 0 || file.data.length === 0) {
        return {
            valid: false,
            error: "Uploaded file is empty (0 bytes). Cannot process empty files.",
        };
    }

    // Enforce 5MB upload size limit
    if (file.size > MAX_FILE_SIZE) {
        return {
            valid: false,
            error: `File size exceeds the limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB.`,
        };
    }

    const ext = path.extname(file.name).toLowerCase();
    if (!ext) {
        return {
            valid: false,
            error: "File must have a valid extension.",
        };
    }

    // Disallow dangerous executable extensions
    const dangerousExtensions = new Set([
        ".exe",
        ".bat",
        ".cmd",
        ".sh",
        ".php",
        ".pl",
        ".cgi",
        ".jar",
        ".vbs",
        ".js",
    ]);

    if (dangerousExtensions.has(ext)) {
        return {
            valid: false,
            error: `File type '${ext}' is not permitted for security reasons.`,
        };
    }

    const isDocument =
        SUPPORTED_DOCUMENT_EXTENSIONS.has(ext) ||
        SUPPORTED_DOCUMENT_MIMES.has(file.mimetype);

    const isSupportedGeneral =
        isDocument ||
        OTHER_SUPPORTED_EXTENSIONS.has(ext) ||
        (file.mimetype && (
            file.mimetype.startsWith("image/") ||
            file.mimetype.startsWith("video/") ||
            file.mimetype.startsWith("audio/")
        ));

    if (!isSupportedGeneral) {
        return {
            valid: false,
            error: `Unsupported file format '${ext}'. Supported document formats for Ask VaultMind are: PDF, DOCX, TXT, MD, CSV.`,
        };
    }

    const sanitizedName = sanitizeFilename(file.name);

    return {
        valid: true,
        sanitizedName,
        extension: ext,
        isDocument,
        size: file.size,
        mimetype: file.mimetype,
    };
};

module.exports = {
    MAX_FILE_SIZE,
    SUPPORTED_DOCUMENT_EXTENSIONS: Array.from(SUPPORTED_DOCUMENT_EXTENSIONS),
    SUPPORTED_DOCUMENT_MIMES: Array.from(SUPPORTED_DOCUMENT_MIMES),
    validateUploadFile,
    sanitizeFilename,
};
