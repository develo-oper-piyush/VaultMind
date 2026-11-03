const File = require("../models/file.model");

const computeTFIDF = (documents) => {
    const tf = [];
    const df = {};
    const idf = {};

    documents.forEach((doc) => {
        const words = doc.words;
        const wordCount = {};
        const uniqueWords = new Set(words);

        words.forEach((word) => {
            wordCount[word] = (wordCount[word] || 0) + 1;
        });

        const tfDoc = {};
        Object.keys(wordCount).forEach((word) => {
            tfDoc[word] = wordCount[word] / words.length;
        });
        tf.push(tfDoc);

        uniqueWords.forEach((word) => {
            df[word] = (df[word] || 0) + 1;
        });
    });

    const numDocs = documents.length;
    Object.keys(df).forEach((word) => {
        idf[word] = Math.log(numDocs / df[word]);
    });

    const tfidf = tf.map((tfDoc) => {
        const tfidfDoc = {};
        Object.keys(tfDoc).forEach((word) => {
            tfidfDoc[word] = tfDoc[word] * (idf[word] || 0);
        });
        return tfidfDoc;
    });

    return { tfidf, idf };
};

const cosineSimilarity = (vec1, vec2) => {
    const allKeys = new Set([...Object.keys(vec1), ...Object.keys(vec2)]);
    let dotProduct = 0;
    let mag1 = 0;
    let mag2 = 0;

    allKeys.forEach((key) => {
        const val1 = vec1[key] || 0;
        const val2 = vec2[key] || 0;
        dotProduct += val1 * val2;
        mag1 += val1 * val1;
        mag2 += val2 * val2;
    });

    if (mag1 === 0 || mag2 === 0) return 0;
    return dotProduct / (Math.sqrt(mag1) * Math.sqrt(mag2));
};

const tokenize = (text) => {
    if (!text) return [];
    const stopWords = new Set([
        "the",
        "a",
        "an",
        "and",
        "or",
        "but",
        "in",
        "on",
        "at",
        "to",
        "for",
        "of",
        "with",
        "by",
        "from",
        "as",
        "is",
        "was",
        "are",
        "were",
        "been",
        "be",
        "have",
        "has",
        "had",
        "do",
        "does",
        "did",
        "will",
        "would",
        "should",
        "could",
        "may",
        "might",
        "can",
        "this",
        "that",
        "these",
        "those",
    ]);

    return text
        .toLowerCase()
        .replace(/[^\w\s]/g, " ")
        .split(/\s+/)
        .filter((word) => word.length > 2 && !stopWords.has(word));
};

const searchFiles = async (userId, query) => {
    try {
        const files = await File.find({
            userId,
            isDeleted: { $ne: true },
        }).lean();

        if (!files || files.length === 0) {
            return [];
        }

        const queryWords = tokenize(query);
        if (queryWords.length === 0) {
            return files.map((file) => ({
                ...file,
                score: 0,
            }));
        }

        const documents = files.map((file) => {
            const combinedText = [
                file.fileName || "",
                file.originalName || "",
                file.textContent || "",
                ...(file.keywords || []),
                ...(file.tags || []),
                file.category || "",
            ].join(" ");

            return {
                file,
                words: tokenize(combinedText),
            };
        });

        documents.push({
            file: null,
            words: queryWords,
        });

        const { tfidf, idf } = computeTFIDF(documents);

        const queryTFIDF = tfidf[tfidf.length - 1];

        const results = [];
        for (let i = 0; i < files.length; i++) {
            const docTFIDF = tfidf[i];
            const similarity = cosineSimilarity(queryTFIDF, docTFIDF);

            let filenameBoost = 0;
            const lowerFileName = (files[i].fileName || "").toLowerCase();
            const lowerOriginalName = (files[i].originalName || "").toLowerCase();
            const lowerQuery = query.toLowerCase();

            if (
                lowerFileName.includes(lowerQuery) ||
                lowerOriginalName.includes(lowerQuery)
            ) {
                filenameBoost = 0.5;
            }

            const finalScore = similarity + filenameBoost;

            results.push({
                ...files[i],
                score: finalScore,
            });
        }

        results.sort((a, b) => b.score - a.score);

        return results.filter((r) => r.score > 0);
    } catch (error) {
        console.error("Search error:", error);
        throw error;
    }
};

module.exports = {
    searchFiles,
};
