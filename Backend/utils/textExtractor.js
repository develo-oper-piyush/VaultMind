const pdfParseModule = require("pdf-parse");
const mammoth = require("mammoth");

/**
 * Clean and normalize extracted document text
 * - Normalizes Windows/Mac line endings (\r\n -> \n)
 * - Removes non-printable control characters except \n and \t
 * - Collapses 3+ consecutive line breaks into 2
 * - Collapses multiple spaces and tabs into a single space
 */
const normalizeExtractedText = (text) => {
    if (!text || typeof text !== "string") {
        return "";
    }

    return text
        // Normalize CRLF to LF
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        // Remove null bytes and non-printable control chars except \n and \t
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
        // Replace non-standard unicode whitespace with standard space
        .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " ")
        // Collapse excessive blank lines
        .replace(/\n{3,}/g, "\n\n")
        // Trim leading and trailing whitespace
        .trim();
};

/**
 * Extract text and page metadata from a PDF buffer
 */
const extractFromPdf = async (buffer) => {
    try {
        let fullText = "";
        const pages = [];

        // Check if pdf-parse is v2 (exposes PDFParse class)
        if (pdfParseModule.PDFParse) {
            const parser = new pdfParseModule.PDFParse({ data: buffer });
            const result = await parser.getText();
            await parser.destroy();

            fullText = result.text || "";

            if (Array.isArray(result.pages)) {
                result.pages.forEach((page) => {
                    const pageText = normalizeExtractedText(page.text || "");
                    if (pageText.length > 0) {
                        pages.push({
                            pageNumber: page.num,
                            text: pageText,
                        });
                    }
                });
            }
        } else if (typeof pdfParseModule === "function") {
            // Fallback for v1 functional API
            const result = await pdfParseModule(buffer);
            fullText = result.text || "";
            if (result.numpages) {
                // If per-page details not directly segmented in v1, treat as single page 1
                pages.push({
                    pageNumber: 1,
                    text: normalizeExtractedText(fullText),
                });
            }
        }

        const normalizedFull = normalizeExtractedText(fullText);

        if (!normalizedFull || normalizedFull.length === 0) {
            return {
                success: false,
                text: null,
                pages: [],
                pageCount: 0,
                isScanned: true,
                error: "Scanned or image-only PDF detected. No extractable digital text found (OCR is not supported).",
            };
        }

        return {
            success: true,
            text: normalizedFull,
            pages: pages.length > 0 ? pages : [{ pageNumber: 1, text: normalizedFull }],
            pageCount: pages.length || 1,
        };
    } catch (err) {
        console.error("PDF extraction error:", err.message);
        return {
            success: false,
            text: null,
            pages: [],
            pageCount: 0,
            error: `PDF extraction failed: ${err.message}`,
        };
    }
};

/**
 * Extract text from a Word document (DOCX / DOC) buffer
 */
const extractFromWord = async (buffer) => {
    try {
        const result = await mammoth.extractRawText({ buffer });
        const normalized = normalizeExtractedText(result.value || "");

        if (!normalized || normalized.length === 0) {
            return {
                success: false,
                text: null,
                pages: [],
                pageCount: 0,
                error: "Word document contains no readable text.",
            };
        }

        return {
            success: true,
            text: normalized,
            pages: [{ pageNumber: 1, text: normalized }],
            pageCount: 1,
        };
    } catch (err) {
        console.error("DOCX extraction error:", err.message);
        return {
            success: false,
            text: null,
            pages: [],
            pageCount: 0,
            error: `Word document extraction failed: ${err.message}`,
        };
    }
};

/**
 * Extract text from plain text formats (TXT, Markdown, CSV)
 */
const extractFromPlainText = (buffer) => {
    try {
        const rawText = buffer.toString("utf-8");
        const normalized = normalizeExtractedText(rawText);

        if (!normalized || normalized.length === 0) {
            return {
                success: false,
                text: null,
                pages: [],
                pageCount: 0,
                error: "Document contains no readable text (file is empty).",
            };
        }

        return {
            success: true,
            text: normalized,
            pages: [{ pageNumber: 1, text: normalized }],
            pageCount: 1,
        };
    } catch (err) {
        console.error("Plain text extraction error:", err.message);
        return {
            success: false,
            text: null,
            pages: [],
            pageCount: 0,
            error: `Plain text extraction failed: ${err.message}`,
        };
    }
};

/**
 * Main dispatcher for document text extraction based on MIME type and extension
 */
const extractDocument = async (buffer, mimetype, filename = "") => {
    if (!buffer || buffer.length === 0) {
        return {
            success: false,
            text: null,
            pages: [],
            pageCount: 0,
            error: "Cannot extract text from an empty buffer.",
        };
    }

    const lowerExt = filename.toLowerCase();

    // 1. PDF
    if (mimetype === "application/pdf" || lowerExt.endsWith(".pdf")) {
        return extractFromPdf(buffer);
    }

    // 2. Word (.docx / .doc)
    if (
        mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        mimetype === "application/msword" ||
        lowerExt.endsWith(".docx") ||
        lowerExt.endsWith(".doc")
    ) {
        return extractFromWord(buffer);
    }

    // 3. Plain text, Markdown, CSV
    if (
        (mimetype && (mimetype.startsWith("text/") || mimetype === "application/csv")) ||
        lowerExt.endsWith(".txt") ||
        lowerExt.endsWith(".md") ||
        lowerExt.endsWith(".csv")
    ) {
        return extractFromPlainText(buffer);
    }

    return {
        success: false,
        text: null,
        pages: [],
        pageCount: 0,
        error: `Unsupported document format '${mimetype}' for text extraction.`,
    };
};

/**
 * Compatibility wrapper matching original signature: extractTextFromBuffer(buffer, mimetype)
 */
const extractTextFromBuffer = async (buffer, mimetype) => {
    const result = await extractDocument(buffer, mimetype);
    return result.text || null;
};

/**
 * Keyword extraction using frequency analysis & stop-word filtering
 */
const extractKeywords = (text) => {
    if (!text || typeof text !== "string") return [];

    const stopWords = new Set([
        "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of",
        "with", "by", "from", "as", "is", "was", "are", "were", "been", "be", "have",
        "has", "had", "do", "does", "did", "will", "would", "should", "could", "may",
        "might", "can", "this", "that", "these", "those", "i", "you", "he", "she",
        "it", "we", "they", "what", "which", "who", "when", "where", "why", "how",
        "about", "above", "after", "again", "all", "also", "any", "because", "before",
        "between", "both", "during", "each", "further", "here", "just", "more", "most",
        "only", "other", "our", "out", "over", "same", "so", "some", "such", "than",
        "then", "there", "their", "them", "through", "too", "under", "until", "very",
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

    return Object.entries(wordFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map((entry) => entry[0]);
};

module.exports = {
    extractDocument,
    extractTextFromBuffer,
    normalizeExtractedText,
    extractKeywords,
};
