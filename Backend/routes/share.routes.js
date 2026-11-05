const express = require("express");
const router = express.Router();
const { rateLimit } = require("express-rate-limit");
const authMiddleware = require("../middlewares/auth.middleware");

// Rate limiter to prevent brute-forcing passwords on protected share links
const sharePasswordLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: "Too many password verification attempts. Please try again after 15 minutes.",
    },
});
const {
    createShareLink,
    getFileShares,
    revokeShareLink,
    getPublicShare,
    verifySharePassword,
    getShareFileStream,
} = require("../services/shareService");

// -------------------------------------------------------------
// Authenticated Share Management Routes
// -------------------------------------------------------------

// POST /share/file/:fileId or /api/share/file/:fileId -> Create a share link
router.post("/file/:fileId", authMiddleware, async (req, res) => {
    try {
        const { fileId } = req.params;
        const userId = req.user.userId;
        const { expiresInHours, password, allowDownload, maxViews } = req.body;

        const share = await createShareLink(fileId, userId, {
            expiresInHours,
            password,
            allowDownload,
            maxViews,
        });

        const baseUrl =
            process.env.FRONTEND_URL || "http://localhost:3001";
        const shareUrl = `${baseUrl}/share/${share.token}`;

        res.status(201).json({
            success: true,
            message: "Share link created successfully",
            share: {
                ...share,
                shareUrl,
            },
        });
    } catch (error) {
        console.error("Create share link error:", error.message);
        res.status(error.status || 400).json({
            success: false,
            error: error.message || "Failed to create share link",
        });
    }
});

// GET /share/file/:fileId or /api/share/file/:fileId -> List all active shares for a file
router.get("/file/:fileId", authMiddleware, async (req, res) => {
    try {
        const { fileId } = req.params;
        const userId = req.user.userId;

        const shares = await getFileShares(fileId, userId);
        const baseUrl =
            process.env.FRONTEND_URL || "http://localhost:3001";

        const formattedShares = shares.map((s) => ({
            ...s,
            shareUrl: `${baseUrl}/share/${s.token}`,
        }));

        res.json({
            success: true,
            shares: formattedShares,
        });
    } catch (error) {
        console.error("Get shares error:", error.message);
        res.status(500).json({
            success: false,
            error: error.message || "Failed to retrieve share links",
        });
    }
});

// DELETE /share/:token or /api/share/:token -> Revoke a share link
router.delete("/:token", authMiddleware, async (req, res) => {
    try {
        const { token } = req.params;
        const userId = req.user.userId;

        const result = await revokeShareLink(token, userId);
        res.json(result);
    } catch (error) {
        console.error("Revoke share link error:", error.message);
        res.status(error.status || 400).json({
            success: false,
            error: error.message || "Failed to revoke share link",
        });
    }
});

// -------------------------------------------------------------
// Public Share Routes (No authentication required)
// -------------------------------------------------------------

// GET /share/public/:token -> Fetch public share metadata
router.get("/public/:token", async (req, res) => {
    try {
        const { token } = req.params;
        const shareInfo = await getPublicShare(token);
        res.json({
            success: true,
            data: shareInfo,
        });
    } catch (error) {
        console.error("Public share metadata error:", error.message);
        res.status(error.status || 404).json({
            success: false,
            error: error.message || "Share link unavailable",
        });
    }
});

// POST /share/public/:token/verify -> Verify password for protected link (rate-limited)
router.post("/public/:token/verify", sharePasswordLimiter, async (req, res) => {
    try {
        const { token } = req.params;
        const { password } = req.body;

        const result = await verifySharePassword(token, password);
        res.json(result);
    } catch (error) {
        console.error("Verify password error:", error.message);
        res.status(error.status || 401).json({
            success: false,
            error: error.message || "Invalid password",
        });
    }
});

// GET /share/public/:token/content -> Stream or download shared file
router.get("/public/:token/content", async (req, res) => {
    try {
        const { token } = req.params;
        const authToken = req.query.auth || req.headers.authorization?.replace(/^Bearer\s+/i, "");
        const isDownload = req.query.download === "true" || req.query.download === "1";

        const { buffer, mimetype, originalName } = await getShareFileStream(
            token,
            authToken,
            isDownload
        );

        res.setHeader("Content-Type", mimetype);
        const disposition = isDownload ? "attachment" : "inline";
        res.setHeader(
            "Content-Disposition",
            `${disposition}; filename="${encodeURIComponent(originalName)}"`
        );

        res.send(buffer);
    } catch (error) {
        console.error("Public share stream error:", error.message);
        res.status(error.status || 500).json({
            success: false,
            error: error.message || "Failed to stream file",
        });
    }
});

module.exports = router;

