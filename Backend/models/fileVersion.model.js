const mongoose = require("mongoose");

const fileVersionSchema = new mongoose.Schema({
    fileId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "File",
        required: [true, "Associated fileId is required"],
        index: true,
    },
    userId: {
        type: String,
        required: [true, "userId is required"],
        index: true,
    },
    versionNumber: {
        type: Number,
        required: [true, "versionNumber is required"],
        min: [1, "versionNumber must be at least 1"],
    },
    originalName: {
        type: String,
        required: [true, "originalName is required"],
        trim: true,
    },
    storagePath: {
        type: String,
        required: [true, "storagePath is required"],
        trim: true,
    },
    mimetype: {
        type: String,
        required: [true, "mimetype is required"],
        trim: true,
    },
    size: {
        type: Number,
        required: [true, "size is required"],
        min: [0, "size cannot be negative"],
    },
    contentHash: {
        type: String,
        default: null,
        trim: true,
    },
    changeSummary: {
        type: String,
        default: "Updated file content",
        trim: true,
        maxlength: [300, "changeSummary cannot exceed 300 characters"],
    },
    summarySnapshot: {
        type: String,
        default: null,
    },
    tagsSnapshot: {
        type: [String],
        default: [],
    },
    createdBy: {
        type: String,
        required: [true, "createdBy is required"],
        trim: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
        immutable: true,
    },
});

// Compound unique index ensuring version numbers are unique per file
fileVersionSchema.index({ fileId: 1, versionNumber: 1 }, { unique: true });

// Index for listing versions for a file in chronological order
fileVersionSchema.index({ fileId: 1, createdAt: -1 });

// Index for querying versions by user
fileVersionSchema.index({ userId: 1, createdAt: -1 });

const FileVersion = mongoose.model("FileVersion", fileVersionSchema);
module.exports = FileVersion;
