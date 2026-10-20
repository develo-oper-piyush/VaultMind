const mongoose = require("mongoose");
const DocumentChunk = require("../models/documentChunk.model");
const ragConfig = require("../config/ragConfig");

// Comprehensive stopwords list including general conversational filler and question prefixes
const STOP_WORDS = new Set([
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of",
    "with", "by", "from", "as", "is", "was", "are", "were", "been", "be", "have",
    "has", "had", "do", "does", "did", "will", "would", "should", "could", "may",
    "might", "can", "this", "that", "these", "those", "i", "you", "he", "she",
    "it", "we", "they", "what", "which", "who", "when", "where", "why", "how",
    "about", "above", "after", "again", "all", "also", "any", "because", "before",
    "between", "both", "during", "each", "further", "here", "just", "more", "most",
    "only", "other", "our", "out", "over", "same", "so", "some", "such", "than",
    "then", "there", "their", "them", "through", "too", "under", "until", "very",
    "tell", "me", "show", "give", "explain", "describe", "find", "list",
]);

/**
 * Tokenize text into normalized lowercase tokens without stopwords
 */
const tokenize = (text) => {
    if (!text || typeof text !== "string") return [];

    return text
        .toLowerCase()
        .replace(/[^\w\s]/g, " ")
        .split(/\s+/)
        .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
};

/**
 * Calculate cosine similarity between two sparse vector objects
 */
const cosineSimilarity = (vec1, vec2) => {
    const keys = Object.keys(vec1);
    let dotProduct = 0;
    let mag1 = 0;
    let mag2 = 0;

    for (const key of keys) {
        const val1 = vec1[key];
        mag1 += val1 * val1;
        if (vec2[key]) {
            dotProduct += val1 * vec2[key];
        }
    }

    for (const key of Object.keys(vec2)) {
        mag2 += vec2[key] * vec2[key];
    }

    if (mag1 === 0 || mag2 === 0) return 0;
    return dotProduct / (Math.sqrt(mag1) * Math.sqrt(mag2));
};

/**
 * Rank a collection of document chunks against a query using TF-IDF + Keyword / Phrase Boosting
 */
const rankChunks = (chunks, query, options = {}) => {
    const minScore = options.minScore !== undefined ? options.minScore : ragConfig.MIN_SIMILARITY_SCORE || 0.05;
    const topK = options.topK || ragConfig.TOP_K_CHUNKS || 5;

    if (!chunks || chunks.length === 0 || !query || query.trim().length === 0) {
        return [];
    }

    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) {
        return [];
    }

    const numChunks = chunks.length;
    const chunkTokensList = chunks.map((chunk) => tokenize(chunk.text));

    // Calculate document frequency (DF) for all terms in vocabulary
    const df = {};
    chunkTokensList.forEach((tokens) => {
        const uniqueTokens = new Set(tokens);
        uniqueTokens.forEach((token) => {
            df[token] = (df[token] || 0) + 1;
        });
    });

    // Also include query terms in DF count
    queryTokens.forEach((token) => {
        if (!df[token]) {
            df[token] = 1;
        }
    });

    // Calculate IDF with Laplace smoothing
    const idf = {};
    Object.keys(df).forEach((token) => {
        idf[token] = Math.log((numChunks + 1) / (df[token] + 1)) + 1.0;
    });

    // Calculate Query TF-IDF vector
    const queryWordCounts = {};
    queryTokens.forEach((t) => {
        queryWordCounts[t] = (queryWordCounts[t] || 0) + 1;
    });

    const queryVec = {};
    Object.keys(queryWordCounts).forEach((token) => {
        const tf = queryWordCounts[token] / queryTokens.length;
        queryVec[token] = tf * (idf[token] || 1.0);
    });

    const lowerQuery = query.toLowerCase().trim();
    const scoredChunks = [];

    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const tokens = chunkTokensList[i];

        if (tokens.length === 0) continue;

        // Calculate Chunk TF-IDF vector
        const chunkWordCounts = {};
        tokens.forEach((t) => {
            chunkWordCounts[t] = (chunkWordCounts[t] || 0) + 1;
        });

        const chunkVec = {};
        Object.keys(chunkWordCounts).forEach((token) => {
            const tf = chunkWordCounts[token] / tokens.length;
            chunkVec[token] = tf * (idf[token] || 1.0);
        });

        // Base cosine similarity
        let score = cosineSimilarity(queryVec, chunkVec);

        // Boost 1: Exact phrase match in chunk text
        const lowerChunkText = (chunk.text || "").toLowerCase();
        if (lowerChunkText.includes(lowerQuery)) {
            score += 0.35;
        }

        // Boost 2: Keyword match in chunk keywords array
        if (Array.isArray(chunk.keywords) && chunk.keywords.length > 0) {
            const lowerKeywords = chunk.keywords.map((k) => k.toLowerCase());
            for (const token of queryTokens) {
                if (lowerKeywords.includes(token)) {
                    score += 0.12;
                }
            }
        }

        // Boost 3: Filename / Document name match
        const lowerDocName = (chunk.originalName || chunk.fileName || "").toLowerCase();
        for (const token of queryTokens) {
            if (lowerDocName.includes(token)) {
                score += 0.15;
            }
        }

        // Only include if score meets minimum threshold
        if (score >= minScore) {
            scoredChunks.push({
                _id: chunk._id,
                fileId: chunk.fileId,
                fileName: chunk.fileName,
                originalName: chunk.originalName || chunk.fileName,
                chunkIndex: chunk.chunkIndex,
                text: chunk.text,
                pageNumber: chunk.pageNumber || null,
                charStart: chunk.charStart,
                charEnd: chunk.charEnd,
                keywords: chunk.keywords || [],
                metadata: chunk.metadata || {},
                score: Math.min(1.0, Math.round(score * 1000) / 1000), // normalized to 3 decimal places
            });
        }
    }

    // Sort descending by score
    scoredChunks.sort((a, b) => b.score - a.score);

    // Return top-K
    return scoredChunks.slice(0, topK);
};

/**
 * Retrieve the most relevant chunks from MongoDB for an authenticated user
 * Supports document-level filtering by fileId or fileName
 */
const retrieveRelevantChunks = async (userId, query, options = {}) => {
    if (!userId) {
        throw new Error("User ID is required for chunk retrieval.");
    }

    if (!query || query.trim().length === 0) {
        return {
            chunks: [],
            totalFound: 0,
            query: "",
            sufficientContext: false,
        };
    }

    const minScore = options.minScore !== undefined ? options.minScore : ragConfig.MIN_SIMILARITY_SCORE || 0.05;
    const topK = options.topK || ragConfig.TOP_K_CHUNKS || 5;

    // Build MongoDB query strictly scoped to current user
    const dbQuery = { userId };

    // Apply document-level filtering if specified
    if (options.fileFilters && Array.isArray(options.fileFilters) && options.fileFilters.length > 0) {
        const validObjectIds = [];
        const stringNames = [];

        options.fileFilters.forEach((filter) => {
            if (mongoose.Types.ObjectId.isValid(filter)) {
                validObjectIds.push(new mongoose.Types.ObjectId(filter));
            } else {
                stringNames.push(filter);
            }
        });

        const filterConditions = [];
        if (validObjectIds.length > 0) {
            filterConditions.push({ fileId: { $in: validObjectIds } });
        }
        if (stringNames.length > 0) {
            filterConditions.push({
                $or: [
                    { fileName: { $in: stringNames } },
                    { originalName: { $in: stringNames } },
                ],
            });
        }

        if (filterConditions.length === 1) {
            Object.assign(dbQuery, filterConditions[0]);
        } else if (filterConditions.length > 1) {
            dbQuery.$or = filterConditions;
        }
    }

    // Fetch candidate chunks from MongoDB
    const chunks = await DocumentChunk.find(dbQuery).lean();

    if (!chunks || chunks.length === 0) {
        return {
            chunks: [],
            totalFound: 0,
            query,
            sufficientContext: false,
        };
    }

    // Rank candidate chunks using vector space retrieval
    const ranked = rankChunks(chunks, query, { minScore, topK });

    return {
        chunks: ranked,
        totalFound: ranked.length,
        query,
        sufficientContext: ranked.length > 0 && ranked[0].score >= minScore,
    };
};

module.exports = {
    tokenize,
    cosineSimilarity,
    rankChunks,
    retrieveRelevantChunks,
};
