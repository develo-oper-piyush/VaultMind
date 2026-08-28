const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");

const extractTextFromBuffer = async (buffer, mimetype) => {
    try {
        if (mimetype === "application/pdf") {
            const data = await pdfParse(buffer);
            return data.text || null;
        }

        if (
            mimetype ===
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
            mimetype === "application/msword"
        ) {
            const result = await mammoth.extractRawText({ buffer });
            return result.value || null;
        }

        if (mimetype.startsWith("text/")) {
            return buffer.toString("utf-8");
        }

        return null;
    } catch (error) {
        console.error("Text extraction error:", error);
        return null;
    }
};

const extractKeywords = (text) => {
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
        "i",
        "you",
        "he",
        "she",
        "it",
        "we",
        "they",
        "what",
        "which",
        "who",
        "when",
        "where",
        "why",
        "how",
    ]);

    const words = text
        .toLowerCase()
        .replace(/[^\w\s]/g, " ")
        .split(/\s+/)
        .filter((word) => word.length > 3 && !stopWords.has(word));

    const wordFreq = {};
    words.forEach((word) => {
        wordFreq[word] = (wordFreq[word] || 0) + 1;
    });

    const sortedWords = Object.entries(wordFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map((entry) => entry[0]);

    return sortedWords;
};

module.exports = {
    extractTextFromBuffer,
    extractKeywords,
};
