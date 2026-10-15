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
    textContent: {
        type: String,
        default: null,
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

// Text index for keyword search
fileSchema.index({ textContent: "text", keywords: "text", fileName: "text" });

const File = mongoose.model("File", fileSchema);
module.exports = File;
