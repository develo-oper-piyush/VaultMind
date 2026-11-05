const mongoose = require("mongoose");

const shareSchema = new mongoose.Schema({
    token: {
        type: String,
        required: [true, "Share token is required"],
        unique: true,
        index: true,
        trim: true,
    },
    fileId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "File",
        required: [true, "File ID is required"],
        index: true,
    },
    userId: {
        type: String,
        required: [true, "User ID is required"],
        index: true,
    },
    hasPassword: {
        type: Boolean,
        default: false,
    },
    passwordHash: {
        type: String,
        default: null,
    },
    expiresAt: {
        type: Date,
        default: null, // null means never expires
        index: true,
    },
    allowDownload: {
        type: Boolean,
        default: true,
    },
    maxViews: {
        type: Number,
        default: null, // null means unlimited
    },
    viewsCount: {
        type: Number,
        default: 0,
    },
    isActive: {
        type: Boolean,
        default: true,
        index: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = mongoose.model("Share", shareSchema);

