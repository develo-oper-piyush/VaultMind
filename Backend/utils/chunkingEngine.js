const { extractKeywords } = require("./textExtractor");
const ragConfig = require("../config/ragConfig");

const DEFAULT_CHUNK_SIZE = ragConfig.CHUNK_SIZE || 800;
const DEFAULT_CHUNK_OVERLAP = ragConfig.CHUNK_OVERLAP || 150;
const MIN_CHUNK_SIZE = 50;

/**
 * Find natural boundary to split text near target chunk size
 * Priority: Paragraph break (\n\n) > Sentence end (. / ? / !) > Line break (\n) > Word boundary (space)
 */
const findNaturalSplitPoint = (text, start, targetSize) => {
    const end = Math.min(start + targetSize, text.length);
    if (end >= text.length) {
        return text.length;
    }

    const searchWindowStart = Math.max(start + Math.floor(targetSize * 0.7), start);
    const searchSlice = text.substring(searchWindowStart, end);

    // 1. Check for paragraph break (\n\n)
    const paraIndex = searchSlice.lastIndexOf("\n\n");
    if (paraIndex !== -1) {
        return searchWindowStart + paraIndex + 2;
    }

    // 2. Check for sentence endings (. / ? / ! followed by space or newline)
    const sentenceMatch = searchSlice.match(/([.?!])(\s+)[^.?!]*$/);
    if (sentenceMatch && sentenceMatch.index !== undefined) {
        return searchWindowStart + sentenceMatch.index + sentenceMatch[1].length + sentenceMatch[2].length;
    }

    // 3. Check for single newline (\n)
    const newlineIndex = searchSlice.lastIndexOf("\n");
    if (newlineIndex !== -1) {
        return searchWindowStart + newlineIndex + 1;
    }

    // 4. Check for word boundary (space)
    const spaceIndex = searchSlice.lastIndexOf(" ");
    if (spaceIndex !== -1) {
        return searchWindowStart + spaceIndex + 1;
    }

    // Fallback: hard cut at targetSize
    return end;
};

/**
 * Split a single block of text into overlapping chunks
 */
const chunkTextBlock = (text, options = {}) => {
    const chunkSize = options.chunkSize || DEFAULT_CHUNK_SIZE;
    const chunkOverlap = options.chunkOverlap || DEFAULT_CHUNK_OVERLAP;
    const pageNumber = options.pageNumber || null;
    const globalStartIndex = options.globalOffset || 0;

    if (!text || typeof text !== "string") {
        return [];
    }

    const trimmed = text.trim();
    if (trimmed.length < MIN_CHUNK_SIZE) {
        if (trimmed.length === 0) return [];
        return [{
            text: trimmed,
            pageNumber,
            charStart: globalStartIndex,
            charEnd: globalStartIndex + trimmed.length,
            keywords: extractKeywords(trimmed).slice(0, 8),
            metadata: {
                tokenEstimate: Math.ceil(trimmed.length / 4),
                length: trimmed.length,
            },
        }];
    }

    const chunks = [];
    let start = 0;

    while (start < text.length) {
        const splitPoint = findNaturalSplitPoint(text, start, chunkSize);
        const chunkText = text.substring(start, splitPoint).trim();

        if (chunkText.length >= MIN_CHUNK_SIZE) {
            chunks.push({
                text: chunkText,
                pageNumber,
                charStart: globalStartIndex + start,
                charEnd: globalStartIndex + splitPoint,
                keywords: extractKeywords(chunkText).slice(0, 8),
                metadata: {
                    tokenEstimate: Math.ceil(chunkText.length / 4),
                    length: chunkText.length,
                },
            });
        }

        if (splitPoint >= text.length) {
            break;
        }

        // Calculate next start with overlap, advancing forward by at least 1 character
        const nextStartCandidate = splitPoint - chunkOverlap;
        const nextStart = Math.max(start + 1, nextStartCandidate);

        // Adjust nextStart to avoid splitting right inside a word if possible
        if (nextStart < text.length && text[nextStart] !== " " && text[nextStart - 1] !== " ") {
            const nextSpace = text.indexOf(" ", nextStart);
            if (nextSpace !== -1 && nextSpace < splitPoint) {
                start = nextSpace + 1;
            } else {
                start = nextStart;
            }
        } else {
            start = nextStart;
        }
    }

    return chunks;
};

/**
 * Main chunking engine function: processes an extraction result
 * Preserves page numbers from PDF pages or chunks continuous text
 */
const chunkDocument = (extractionResult, options = {}) => {
    const chunkSize = options.chunkSize || DEFAULT_CHUNK_SIZE;
    const chunkOverlap = options.chunkOverlap || DEFAULT_CHUNK_OVERLAP;

    if (!extractionResult) {
        return [];
    }

    const allChunks = [];
    let chunkIndex = 0;

    // Check if per-page extraction is available
    if (Array.isArray(extractionResult.pages) && extractionResult.pages.length > 0) {
        let cumulativeOffset = 0;

        for (const page of extractionResult.pages) {
            const pageText = page.text || "";
            if (!pageText.trim()) continue;

            const pageChunks = chunkTextBlock(pageText, {
                chunkSize,
                chunkOverlap,
                pageNumber: page.pageNumber,
                globalOffset: cumulativeOffset,
            });

            for (const chunk of pageChunks) {
                allChunks.push({
                    chunkIndex: chunkIndex++,
                    ...chunk,
                });
            }

            cumulativeOffset += pageText.length + 1;
        }
    } else if (extractionResult.text) {
        // Continuous text fallback (DOCX, TXT, etc.)
        const rawChunks = chunkTextBlock(extractionResult.text, {
            chunkSize,
            chunkOverlap,
            pageNumber: 1,
            globalOffset: 0,
        });

        for (const chunk of rawChunks) {
            allChunks.push({
                chunkIndex: chunkIndex++,
                ...chunk,
            });
        }
    }

    return allChunks;
};

module.exports = {
    DEFAULT_CHUNK_SIZE,
    DEFAULT_CHUNK_OVERLAP,
    chunkDocument,
    chunkTextBlock,
    findNaturalSplitPoint,
};
