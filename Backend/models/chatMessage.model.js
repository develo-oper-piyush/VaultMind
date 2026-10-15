const mongoose = require("mongoose");

const citationSchema = new mongoose.Schema({
    fileId: {
        type: String,
        default: null,
    },
    documentName: {
        type: String,
        required: true,
    },
    pageNumber: {
        type: Number,
        default: null,
    },
    chunkIndex: {
        type: Number,
        default: null,
    },
    excerpt: {
        type: String,
        required: true,
    },
    similarityScore: {
        type: Number,
        default: null,
    },
}, { _id: false });

const chatMessageSchema = new mongoose.Schema({
    conversationId: {
        type: String,
        required: true,
        index: true,
    },
    userId: {
        type: String,
        required: true,
        index: true,
    },
    role: {
        type: String,
        enum: ["user", "assistant", "system"],
        required: true,
    },
    content: {
        type: String,
        required: true,
    },
    citations: {
        type: [citationSchema],
        default: [],
    },
    fileFilters: {
        type: [String],
        default: [],
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

// Index for retrieving conversation history quickly
chatMessageSchema.index({ userId: 1, conversationId: 1, createdAt: 1 });

const ChatMessage = mongoose.model("ChatMessage", chatMessageSchema);
module.exports = ChatMessage;
