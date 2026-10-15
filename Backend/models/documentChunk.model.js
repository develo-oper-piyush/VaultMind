const mongoose = require("mongoose");

const documentChunkSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        index: true,
    },
    fileId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "File",
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
    chunkIndex: {
        type: Number,
        required: true,
    },
    text: {
        type: String,
        required: true,
    },
    pageNumber: {
        type: Number,
        default: null,
    },
    charStart: {
        type: Number,
        default: null,
    },
    charEnd: {
        type: Number,
        default: null,
    },
    keywords: {
        type: [String],
        default: [],
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

// Compound index for querying all chunks of a specific user or file
documentChunkSchema.index({ userId: 1, fileId: 1, chunkIndex: 1 });

// Full text index for fast keyword matching across chunk text
documentChunkSchema.index({ text: "text", keywords: "text" });

const DocumentChunk = mongoose.model("DocumentChunk", documentChunkSchema);
module.exports = DocumentChunk;
