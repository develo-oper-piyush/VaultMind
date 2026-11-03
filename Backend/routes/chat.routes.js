const express = require("express");
const authMiddleware = require("../middlewares/auth.middleware");
const {
    askDocumentQuestion,
    getChatHistory,
    clearChatHistory,
} = require("../utils/askDocumentService");
const ChatMessage = require("../models/chatMessage.model");

const router = express.Router();

/**
 * POST /chat/ask
 * Ask a natural language question grounded in uploaded documents
 */
router.post(["/ask", "/api/chat/ask"], authMiddleware, async (req, res) => {
    try {
        const { question, conversationId, fileFilters, topK, minScore } = req.body;
        const userId = req.user.userId;

        if (!question || typeof question !== "string" || question.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: "A valid question is required.",
            });
        }

        const result = await askDocumentQuestion(userId, question, {
            conversationId,
            fileFilters: Array.isArray(fileFilters) ? fileFilters : undefined,
            topK: topK ? parseInt(topK, 10) : undefined,
            minScore: minScore !== undefined ? parseFloat(minScore) : undefined,
        });

        res.json({
            success: true,
            answer: result.answer,
            citations: result.citations,
            conversationId: result.conversationId,
            retrievedChunksCount: result.retrievedChunksCount,
            modelUsed: result.modelUsed,
            grounded: result.grounded,
        });
    } catch (error) {
        console.error("Chat ask endpoint error:", error);
        res.status(500).json({
            success: false,
            error: error.message || "Failed to process document question.",
        });
    }
});

/**
 * GET /chat/history
 * Retrieve active conversation history
 */
router.get(["/history", "/api/chat/history"], authMiddleware, async (req, res) => {
    try {
        const userId = req.user.userId;
        const conversationId = req.query.conversationId;

        const history = await getChatHistory(userId, conversationId);

        res.json({
            success: true,
            conversationId: history.conversationId,
            messages: history.messages,
        });
    } catch (error) {
        console.error("Chat history endpoint error:", error);
        res.status(500).json({
            success: false,
            error: "Failed to fetch chat history.",
        });
    }
});

/**
 * POST /chat/clear
 * Clear messages for a conversation
 */
router.post(["/clear", "/api/chat/clear"], authMiddleware, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { conversationId } = req.body;

        const result = await clearChatHistory(userId, conversationId);

        res.json({
            success: true,
            message: "Conversation cleared successfully.",
            deletedCount: result.deletedCount,
        });
    } catch (error) {
        console.error("Chat clear endpoint error:", error);
        res.status(500).json({
            success: false,
            error: "Failed to clear chat history.",
        });
    }
});

/**
 * GET /chat/conversations
 * List conversation threads for the user
 */
router.get(["/conversations", "/api/chat/conversations"], authMiddleware, async (req, res) => {
    try {
        const userId = req.user.userId;

        // Group messages by conversationId to find unique conversation sessions
        const conversations = await ChatMessage.aggregate([
            { $match: { userId } },
            { $sort: { createdAt: -1 } },
            {
                $group: {
                    _id: "$conversationId",
                    lastMessage: { $first: "$content" },
                    role: { $first: "$role" },
                    updatedAt: { $first: "$createdAt" },
                    messageCount: { $sum: 1 },
                },
            },
            { $sort: { updatedAt: -1 } },
            { $limit: 20 },
        ]);

        res.json({
            success: true,
            conversations: conversations.map((c) => ({
                conversationId: c._id,
                lastMessage: c.lastMessage,
                updatedAt: c.updatedAt,
                messageCount: c.messageCount,
            })),
        });
    } catch (error) {
        console.error("Chat conversations endpoint error:", error);
        res.status(500).json({
            success: false,
            error: "Failed to list conversations.",
        });
    }
});

module.exports = router;
