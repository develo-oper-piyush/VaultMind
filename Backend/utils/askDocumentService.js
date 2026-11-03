const { GoogleGenerativeAI } = require("@google/generative-ai");
const ChatMessage = require("../models/chatMessage.model");
const File = require("../models/file.model");
const ragConfig = require("../config/ragConfig");
const { retrieveRelevantChunks } = require("./retrievalEngine");

/**
 * Validate user question input
 */
const validateQuestion = (question) => {
    if (!question || typeof question !== "string") {
        return { valid: false, error: "Question must be a non-empty text string." };
    }

    const trimmed = question.trim();
    if (trimmed.length < 2) {
        return { valid: false, error: "Question is too short (minimum 2 characters)." };
    }

    if (trimmed.length > 1000) {
        return { valid: false, error: "Question is too long (maximum 1000 characters)." };
    }

    return { valid: true, question: trimmed };
};

/**
 * Format retrieved chunks into a prompt with strict untrusted context containment fences
 */
const buildContextPrompt = (question, retrievedChunks) => {
    let contextBlocks = "";

    retrievedChunks.forEach((chunk, idx) => {
        const pageLabel = chunk.pageNumber ? `Page ${chunk.pageNumber}` : "Section / Chunk " + chunk.chunkIndex;
        const docName = chunk.originalName || chunk.fileName || "Document";
        contextBlocks += `\n[Source Excerpt #${idx + 1} | Document: "${docName}" | Location: ${pageLabel}]\n${chunk.text}\n`;
    });

    const fullPrompt = `${ragConfig.SYSTEM_PROMPT}

<<<DOCUMENT_CONTEXT>>>
${contextBlocks}<<<END_DOCUMENT_CONTEXT>>>

USER QUESTION:
${question}

GROUNDED ANSWER (Answer strictly from the context above. If the context does not contain sufficient details to answer, reply with: "${ragConfig.INSUFFICIENT_CONTEXT_MESSAGE}"):`;

    return fullPrompt;
};

/**
 * Generate citations mapped to actual retrieved chunks
 */
const buildCitations = (retrievedChunks) => {
    if (!Array.isArray(retrievedChunks)) return [];

    return retrievedChunks.map((chunk) => {
        // Build readable excerpt snippet (up to 200 characters)
        const cleanText = (chunk.text || "").replace(/\s+/g, " ").trim();
        const excerpt = cleanText.length > 200 ? cleanText.substring(0, 197) + "..." : cleanText;

        return {
            fileId: chunk.fileId ? chunk.fileId.toString() : null,
            documentName: chunk.originalName || chunk.fileName || "Document",
            pageNumber: chunk.pageNumber || null,
            chunkIndex: chunk.chunkIndex !== undefined ? chunk.chunkIndex : null,
            excerpt,
            similarityScore: chunk.score !== undefined ? chunk.score : null,
        };
    });
};

/**
 * Call Gemini model with candidate fallback chain
 */
const generateWithGeminiFallback = async (prompt) => {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY is not configured.");
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    let lastError = null;

    for (const modelName of ragConfig.CANDIDATE_MODELS) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            if (text && text.trim().length > 0) {
                return {
                    answer: text.trim(),
                    modelUsed: modelName,
                };
            }
        } catch (err) {
            lastError = err;
            console.warn(`Gemini model ${modelName} attempt failed: ${err.message}. Trying next fallback...`);
        }
    }

    throw lastError || new Error("All configured Gemini candidate models failed.");
};

/**
 * Main service method: answers a question grounded in the user's documents
 */
const askDocumentQuestion = async (userId, rawQuestion, options = {}) => {
    // 1. Validate question
    const validation = validateQuestion(rawQuestion);
    if (!validation.valid) {
        throw new Error(validation.error);
    }
    const question = validation.question;

    const conversationId = options.conversationId || `conv-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const fileFilters = options.fileFilters || [];

    // 2. Retrieve relevant chunks strictly for this user
    const retrievalResult = await retrieveRelevantChunks(userId, question, {
        fileFilters,
        topK: options.topK || ragConfig.TOP_K_CHUNKS,
        minScore: options.minScore || ragConfig.MIN_SIMILARITY_SCORE,
    });

    const hasSufficientEvidence = retrievalResult.sufficientContext && retrievalResult.chunks.length > 0;

    let answer = "";
    let citations = [];
    let grounded = false;
    let modelUsed = "none";

    // 3. Handle insufficient context: intelligent conversational awareness or honest document fallback
    if (!hasSufficientEvidence) {
        if (!process.env.GEMINI_API_KEY) {
            answer = ragConfig.INSUFFICIENT_CONTEXT_MESSAGE;
            citations = [];
            grounded = false;
        } else {
            try {
                // Fetch list of user's active documents to give the AI context of their vault
                const userFiles = await File.find({ userId })
                    .select("originalName category")
                    .lean()
                    .catch(() => []);

                const activeFiles = userFiles.filter((f) => !f.isDeleted);
                const fileListSummary = activeFiles.length > 0
                    ? activeFiles.map((f) => `- "${f.originalName}" (${f.category || "File"})`).join("\n")
                    : "No uploaded documents found.";

                const conversationalPrompt = `You are VaultMind AI, an intelligent, helpful document and cloud workspace assistant.

Available files in user's vault:
${fileListSummary}

USER QUERY:
"${question}"

INSTRUCTIONS:
1. GREETINGS & CASUAL MESSAGES (e.g., "hy", "hi", "hello", "hey", "what's up", "who are you", "what can you do"):
   Respond warmly and enthusiastically as VaultMind AI. Introduce your capabilities (analyzing documents, answering questions, summarizing files) and invite the user to ask about their files (mentioning any available files like Resume.pdf).
2. VAULT / FILE OVERVIEW (e.g., "what files do I have", "list my files"):
   List and briefly summarize the user's available files from the list above.
3. FACTUAL DOCUMENT QUESTIONS:
   If the user asked a factual question that could not be verified in the documents, state politely: "${ragConfig.INSUFFICIENT_CONTEXT_MESSAGE}" and offer to answer questions about their available files.
Keep the response helpful, natural, and concise (under 3 sentences).`;

                const llmResponse = await generateWithGeminiFallback(conversationalPrompt);
                answer = llmResponse.answer;
                modelUsed = llmResponse.modelUsed;
                grounded = false;
                citations = [];
            } catch (err) {
                console.error("Conversational fallback error:", err.message);
                answer = "Hello! I am VaultMind AI, your workspace assistant. I can answer questions about your uploaded documents or help you search your vault.";
                modelUsed = "conversational-fallback";
                grounded = false;
            }
        }
    } else {
        // 4. Sufficient context found: format prompt and invoke LLM
        citations = buildCitations(retrievalResult.chunks);

        if (!process.env.GEMINI_API_KEY) {
            answer = "AI response generation is currently offline (GEMINI_API_KEY not configured on server). However, relevant evidence excerpts from your documents were found and are cited below.";
            modelUsed = "offline-retrieval";
            grounded = false;
        } else {
            try {
                const prompt = buildContextPrompt(question, retrievalResult.chunks);
                const llmResponse = await generateWithGeminiFallback(prompt);
                answer = llmResponse.answer;
                modelUsed = llmResponse.modelUsed;

                // Check if the model itself determined that context was insufficient
                if (answer.toLowerCase().includes(ragConfig.INSUFFICIENT_CONTEXT_MESSAGE.toLowerCase())) {
                    grounded = false;
                } else {
                    grounded = true;
                }
            } catch (err) {
                console.error("LLM Generation error in askDocumentQuestion:", err.message);
                answer = `Could not generate AI answer: ${err.message}. Relevant source excerpts are shown below.`;
                grounded = false;
            }
        }
    }

    // 5. Persist conversation history to MongoDB ChatMessage collection
    try {
        await ChatMessage.create([
            {
                conversationId,
                userId,
                role: "user",
                content: question,
                fileFilters,
            },
            {
                conversationId,
                userId,
                role: "assistant",
                content: answer,
                citations,
                fileFilters,
            },
        ]);
    } catch (saveErr) {
        console.warn("Could not save chat messages to MongoDB:", saveErr.message);
    }

    return {
        answer,
        citations,
        conversationId,
        retrievedChunksCount: retrievalResult.chunks.length,
        modelUsed,
        grounded,
    };
};

/**
 * Retrieve chat conversation history for a given conversationId or user
 */
const getChatHistory = async (userId, conversationId) => {
    if (!userId) {
        return { messages: [], conversationId: conversationId || "" };
    }

    const query = { userId };
    if (conversationId) {
        query.conversationId = conversationId;
    }

    const messages = await ChatMessage.find(query)
        .sort({ createdAt: 1 })
        .limit(100)
        .lean();

    const formattedMessages = messages.map((m) => ({
        id: m._id ? m._id.toString() : undefined,
        role: m.role,
        content: m.content,
        citations: m.citations || [],
        createdAt: m.createdAt,
        fileFilters: m.fileFilters || [],
    }));

    return {
        messages: formattedMessages,
        conversationId: conversationId || (messages.length > 0 ? messages[0].conversationId : `conv-${Date.now()}`),
    };
};

/**
 * Clear chat history for a specific conversation
 */
const clearChatHistory = async (userId, conversationId) => {
    if (!userId) {
        throw new Error("User ID is required.");
    }

    const query = { userId };
    if (conversationId) {
        query.conversationId = conversationId;
    }

    const result = await ChatMessage.deleteMany(query);
    return {
        success: true,
        deletedCount: result.deletedCount,
    };
};

module.exports = {
    validateQuestion,
    buildContextPrompt,
    buildCitations,
    generateWithGeminiFallback,
    askDocumentQuestion,
    getChatHistory,
    clearChatHistory,
};
