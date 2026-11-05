const mongoose = require("mongoose");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const Share = require("../models/share.model");
const File = require("../models/file.model");
const supabase = require("../config/supabase");

/**
 * Creates a new secure shareable link for a file
 */
const createShareLink = async (fileId, userId, options = {}) => {
    const uId = userId?.toString();
    const query = {
        $or: [{ userId: uId }, { userId }],
        isDeleted: { $ne: true },
    };

    if (mongoose.Types.ObjectId.isValid(fileId)) {
        query.$and = [{ $or: [{ _id: fileId }, { fileName: fileId }] }];
    } else {
        query.fileName = fileId;
    }

    const file = await File.findOne(query);
    if (!file) {
        throw new Error("File not found or has been moved to Recycle Bin");
    }

    const {
        expiresInHours = null,
        password = null,
        allowDownload = true,
        maxViews = null,
    } = options;

    const token = crypto.randomBytes(16).toString("hex");

    let passwordHash = null;
    let hasPassword = false;

    if (password && typeof password === "string" && password.trim().length > 0) {
        passwordHash = await bcrypt.hash(password.trim(), 10);
        hasPassword = true;
    }

    let expiresAt = null;
    if (expiresInHours && Number(expiresInHours) > 0) {
        expiresAt = new Date(Date.now() + Number(expiresInHours) * 3600 * 1000);
    }

    let parsedMaxViews = null;
    if (maxViews && Number(maxViews) > 0) {
        parsedMaxViews = Number(maxViews);
    }

    const share = await Share.create({
        token,
        fileId: file._id,
        userId,
        hasPassword,
        passwordHash,
        expiresAt,
        allowDownload: allowDownload !== false,
        maxViews: parsedMaxViews,
    });

    return {
        token: share.token,
        hasPassword: share.hasPassword,
        expiresAt: share.expiresAt,
        allowDownload: share.allowDownload,
        maxViews: share.maxViews,
        viewsCount: share.viewsCount,
        createdAt: share.createdAt,
    };
};

/**
 * Retrieves all active share links created by the user for a specific file
 */
const getFileShares = async (fileId, userId) => {
    const uId = userId?.toString();
    const fileQuery = {
        $or: [{ userId: uId }, { userId }],
        isDeleted: { $ne: true },
    };
    if (mongoose.Types.ObjectId.isValid(fileId)) {
        fileQuery.$and = [{ $or: [{ _id: fileId }, { fileName: fileId }] }];
    } else {
        fileQuery.fileName = fileId;
    }
    const file = await File.findOne(fileQuery);
    if (!file) {
        return [];
    }

    const shares = await Share.find({
        fileId: file._id,
        $or: [{ userId: uId }, { userId }],
        isActive: true,
    }).sort({ createdAt: -1 });

    return shares.map((s) => ({
        id: s._id,
        token: s.token,
        hasPassword: s.hasPassword,
        expiresAt: s.expiresAt,
        allowDownload: s.allowDownload,
        maxViews: s.maxViews,
        viewsCount: s.viewsCount,
        createdAt: s.createdAt,
        isExpired: s.expiresAt ? new Date() > s.expiresAt : false,
        isViewLimitReached: s.maxViews ? s.viewsCount >= s.maxViews : false,
    }));
};

/**
 * Revokes a share link
 */
const revokeShareLink = async (token, userId) => {
    const share = await Share.findOneAndUpdate(
        { token, userId, isActive: true },
        { isActive: false },
        { new: true }
    );

    if (!share) {
        throw new Error("Share link not found or already revoked");
    }

    return { success: true, message: "Share link successfully revoked" };
};

/**
 * Validates and retrieves public metadata for a shared file
 */
const getPublicShare = async (token) => {
    const share = await Share.findOne({ token, isActive: true }).populate("fileId");
    if (!share || !share.fileId) {
        const error = new Error("This share link does not exist or has been removed.");
        error.status = 404;
        throw error;
    }

    const file = share.fileId;
    if (file.isDeleted) {
        const error = new Error("The shared file is no longer available.");
        error.status = 410;
        throw error;
    }

    // Check expiration
    if (share.expiresAt && new Date() > share.expiresAt) {
        const error = new Error("This share link has expired.");
        error.status = 410;
        throw error;
    }

    // Check view limit
    if (share.maxViews && share.viewsCount >= share.maxViews) {
        const error = new Error("This share link has reached its maximum view limit.");
        error.status = 410;
        throw error;
    }

    // If password-protected, return minimal teaser metadata without file direct preview
    if (share.hasPassword) {
        return {
            token: share.token,
            isProtected: true,
            hasPassword: true,
            fileName: file.originalName || file.fileName,
            mimetype: file.mimetype,
            size: file.size,
            allowDownload: share.allowDownload,
            expiresAt: share.expiresAt,
        };
    }

    return {
        token: share.token,
        isProtected: false,
        hasPassword: false,
        file: {
            id: file._id,
            name: file.originalName || file.fileName,
            mimetype: file.mimetype,
            size: file.size,
            category: file.category,
            createdAt: file.createdAt,
        },
        allowDownload: share.allowDownload,
        expiresAt: share.expiresAt,
        viewsCount: share.viewsCount,
    };
};

/**
 * Verifies password for a password-protected share link and returns an authorization token
 */
const verifySharePassword = async (token, password) => {
    const share = await Share.findOne({ token, isActive: true });
    if (!share) {
        const error = new Error("Share link not found");
        error.status = 404;
        throw error;
    }

    if (!share.hasPassword || !share.passwordHash) {
        return { success: true, authorized: true, token };
    }

    if (!password) {
        const error = new Error("Password is required to access this file");
        error.status = 400;
        throw error;
    }

    const isMatch = await bcrypt.compare(password, share.passwordHash);
    if (!isMatch) {
        const error = new Error("Incorrect password");
        error.status = 401;
        throw error;
    }

    // Generate a temporary 2-hour view token
    const authToken = jwt.sign(
        { token: share.token, shareId: share._id, authorized: true },
        process.env.JWT_SECRET || "vaultmind_share_secret",
        { expiresIn: "2h" }
    );

    return {
        success: true,
        authorized: true,
        authToken,
    };
};

/**
 * Streams file content for public view or download
 */
const getShareFileStream = async (token, authToken = null, isDownload = false) => {
    const share = await Share.findOne({ token, isActive: true }).populate("fileId");
    if (!share || !share.fileId) {
        const error = new Error("Share link not found");
        error.status = 404;
        throw error;
    }

    const file = share.fileId;
    if (file.isDeleted) {
        const error = new Error("The shared file is no longer available.");
        error.status = 410;
        throw error;
    }

    if (share.expiresAt && new Date() > share.expiresAt) {
        const error = new Error("Share link expired");
        error.status = 410;
        throw error;
    }

    if (share.maxViews && share.viewsCount >= share.maxViews) {
        const error = new Error("Maximum view limit reached");
        error.status = 410;
        throw error;
    }

    // Verify password authorization if protected
    if (share.hasPassword) {
        if (!authToken) {
            const error = new Error("Password authorization required to view this file");
            error.status = 401;
            throw error;
        }

        try {
            const decoded = jwt.verify(
                authToken,
                process.env.JWT_SECRET || "vaultmind_share_secret"
            );
            if (decoded.token !== token) {
                const error = new Error("Invalid share authorization token");
                error.status = 403;
                throw error;
            }
        } catch {
            const error = new Error("Authorization expired or invalid. Please re-enter the password.");
            error.status = 401;
            throw error;
        }
    }

    // Check if downloading is prohibited
    if (isDownload && !share.allowDownload) {
        const error = new Error("Downloading has been disabled for this share link");
        error.status = 403;
        throw error;
    }

    // Fetch raw file from Supabase storage
    const storagePath = `${share.userId}/${file.fileName}`;
    const { data, error } = await supabase.storage
        .from("Files-upload")
        .download(storagePath);

    if (error || !data) {
        const err = new Error("Failed to retrieve file from storage");
        err.status = 502;
        throw err;
    }

    // Atomically increment views count
    await Share.updateOne({ _id: share._id }, { $inc: { viewsCount: 1 } });

    const buffer = Buffer.from(await data.arrayBuffer());

    return {
        buffer,
        mimetype: file.mimetype || "application/octet-stream",
        originalName: file.originalName || file.fileName,
        size: file.size,
    };
};

module.exports = {
    createShareLink,
    getFileShares,
    revokeShareLink,
    getPublicShare,
    verifySharePassword,
    getShareFileStream,
};

