const mongoose = require("mongoose");

const fileSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        index: true,
    },
    fileName: {
        type: String,
        required: true,
    },
    originalName: {
        type: String,
        required: true,
    },
    supabasePath: {
        type: String,
        required: true,
    },
    mimetype: {
        type: String,
        required: true,
    },
    size: {
        type: Number,
        required: true,
    },
    contentHash: {
        type: String,
        default: null,
        index: true,
    },
    aiSource: {
        type: String,
        enum: ["inherited_hash", "inherited_similarity", "rule_based", "gemini_generated", "none"],
        default: "none",
    },
    textContent: {
        type: String,
        default: null,
    },
    ocrText: {
        type: String,
        default: null,
    },
    ocrProcessed: {
        type: Boolean,
        default: false,
    },
    keywords: {
        type: [String],
        default: [],
    },
    tags: {
        type: [String],
        default: [],
    },
    category: {
        type: String,
        enum: [
            "Invoice",
            "Resume",
            "Contract",
            "Photo",
            "Screenshot",
            "Report",
            "Presentation",
            "Spreadsheet",
            "Document",
            "Video",
            "Audio",
            "Other",
        ],
        default: "Other",
    },
    summary: {
        type: String,
        default: null,
    },
    chunkCount: {
        type: Number,
        default: 0,
    },
    processingStatus: {
        textExtracted: {
            type: Boolean,
            default: false,
        },
        chunked: {
            type: Boolean,
            default: false,
        },
        indexed: {
            type: Boolean,
            default: false,
        },
        tagged: {
            type: Boolean,
            default: false,
        },
        summarized: {
            type: Boolean,
            default: false,
        },
        error: {
            type: String,
            default: null,
        },
    },
    // File Versioning fields
    currentVersion: {
        type: Number,
        default: 1,
        min: 1,
    },
    totalVersions: {
        type: Number,
        default: 1,
        min: 1,
    },
    // Recycle Bin / Soft Delete fields
    isDeleted: {
        type: Boolean,
        default: false,
        index: true,
    },
    deletedAt: {
        type: Date,
        default: null,
    },
    deletionExpiresAt: {
        type: Date,
        default: null,
        index: true,
    },
    deletedBy: {
        type: String,
        default: null,
    },
    originalFolder: {
        type: String,
        default: "/",
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    updatedAt: {
        type: Date,
        default: Date.now,
    },
});

// Compound index for user files
fileSchema.index({ userId: 1, createdAt: -1 });

// Compound indexes for active vs recycle bin queries
fileSchema.index({ userId: 1, isDeleted: 1, createdAt: -1 });
fileSchema.index({ userId: 1, isDeleted: 1, deletionExpiresAt: 1 });

// Text index for keyword search
fileSchema.index({ textContent: "text", keywords: "text", fileName: "text" });

// Query helpers for active and deleted files
fileSchema.query.active = function () {
    return this.where({ isDeleted: { $ne: true } });
};

fileSchema.query.deleted = function () {
    return this.where({ isDeleted: true });
};

// Static methods for convenience
fileSchema.statics.findActive = function (filter = {}, projection = null, options = {}) {
    return this.find({ ...filter, isDeleted: { $ne: true } }, projection, options);
};

fileSchema.statics.findDeleted = function (filter = {}, projection = null, options = {}) {
    return this.find({ ...filter, isDeleted: true }, projection, options);
};

const File = mongoose.model("File", fileSchema);
module.exports = File;

