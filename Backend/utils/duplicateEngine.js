const path = require("path");

/**
 * Smart Duplicate Detection Engine
 * 
 * Implements deterministic multi-attribute scoring (normalized name, size, type)
 * with Levenshtein ratio, token Jaccard similarity, and plain-English explanation generation.
 */

const WEIGHTS = Object.freeze({
    name: 0.50,
    size: 0.35,
    type: 0.15,
});

const THRESHOLDS = Object.freeze({
    EXACT: 0.95,
    HIGH: 0.80,
    MODERATE: 0.65,
});

const CONFIDENCE_LEVELS = Object.freeze({
    EXACT: "EXACT",
    HIGH: "HIGH",
    MODERATE: "MODERATE",
    NONE: "NONE",
});

/**
 * Format byte count into human-readable representation
 */
const formatBytes = (bytes) => {
    if (bytes === 0) return "0 Bytes";
    if (!bytes || isNaN(bytes) || bytes < 0) return "0 Bytes";

    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const formatted = parseFloat((bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1));
    return `${formatted} ${sizes[i]}`;
};

/**
 * Strip common OS copy suffixes from filename basename
 * e.g. "Invoice (1)" -> "Invoice", "report - Copy (2)" -> "report", "file_copy" -> "file"
 */
const stripCopySuffix = (basename) => {
    if (!basename || typeof basename !== "string") {
        return { cleanName: "", hadCopySuffix: false };
    }

    let clean = basename.trim();
    let hadCopySuffix = false;

    // Patterns matching OS duplicate conventions:
    // 1) " (1)", " (2)"
    // 2) " - Copy", " - copy (1)"
    // 3) "_copy", "_copy2"
    const copyPatterns = [
        /\s*\(\d+\)$/i,
        /\s*-\s*copy(\s*\(\d+\))?$/i,
        /_copy(\d+)?$/i,
        /\s+copy(\s+\d+)?$/i,
    ];

    let matched = true;
    while (matched) {
        matched = false;
        for (const pattern of copyPatterns) {
            if (pattern.test(clean)) {
                clean = clean.replace(pattern, "").trim();
                hadCopySuffix = true;
                matched = true;
                break;
            }
        }
    }

    return { cleanName: clean, hadCopySuffix };
};

/**
 * Canonicalize and normalize filename for similarity matching
 * - Separates basename from extension
 * - Converts to lowercase and trims
 * - Strips duplicate copy suffixes
 * - Replaces underscores, hyphens, and periods with single spaces
 * - Collapses consecutive whitespace
 */
const normalizeBasename = (rawName) => {
    if (!rawName || typeof rawName !== "string") {
        return {
            raw: "",
            cleanBasename: "",
            extension: "",
            hadCopySuffix: false,
        };
    }

    // Normalize Unicode diacritics (e.g. résumé -> resume) and collapse Unicode whitespace
    const unicodeNormalized = typeof rawName.normalize === "function"
        ? rawName.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        : rawName;
    const trimmed = unicodeNormalized.replace(/[\u00A0\u2000-\u200B]/g, " ").trim().toLowerCase();
    const ext = path.extname(trimmed);
    const baseWithoutExt = ext ? trimmed.slice(0, -ext.length) : trimmed;

    const { cleanName, hadCopySuffix } = stripCopySuffix(baseWithoutExt);

    // Replace underscores, hyphens, periods with single space
    let cleanBasename = cleanName
        .replace(/[_\-.]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    // Fallback if stripping punctuation/copy suffixes left the basename empty (e.g. "(1).pdf", "---.txt")
    if (!cleanBasename) {
        cleanBasename = baseWithoutExt.trim() || "unnamed";
    }

    const normalizedExt = ext ? ext.replace(/^\./, "").trim() : "";

    return {
        raw: rawName,
        cleanBasename,
        extension: normalizedExt,
        hadCopySuffix,
    };
};

/**
 * Map file extension aliases to canonical extension names
 */
const EXTENSION_ALIASES = Object.freeze({
    jpeg: "jpg",
    docx: "doc",
    htm: "html",
    tif: "tiff",
    yaml: "yml",
});

/**
 * Normalize extension and map aliases
 */
const normalizeExtension = (filename, mimetype) => {
    let ext = "";
    if (filename && typeof filename === "string") {
        const rawExt = path.extname(filename).toLowerCase().replace(/^\./, "").trim();
        ext = EXTENSION_ALIASES[rawExt] || rawExt;
    }

    if (!ext && mimetype && typeof mimetype === "string") {
        const mimeMap = {
            "application/pdf": "pdf",
            "application/msword": "doc",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "doc",
            "text/plain": "txt",
            "text/markdown": "md",
            "text/csv": "csv",
            "image/jpeg": "jpg",
            "image/png": "png",
            "image/gif": "gif",
            "image/webp": "webp",
            "application/vnd.ms-excel": "xls",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
        };
        ext = mimeMap[mimetype.toLowerCase()] || "";
    }

    return ext;
};

/**
 * Determine generic media group for cross-extension similarity
 */
const getMediaGroup = (ext, mimetype) => {
    const extLower = (ext || "").toLowerCase();
    const mimeLower = (mimetype || "").toLowerCase();

    if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(extLower) || mimeLower.startsWith("image/")) {
        return "image";
    }
    if (["mp4", "webm", "mov", "avi", "mkv"].includes(extLower) || mimeLower.startsWith("video/")) {
        return "video";
    }
    if (["mp3", "wav", "ogg", "m4a", "flac"].includes(extLower) || mimeLower.startsWith("audio/")) {
        return "audio";
    }
    if (["pdf"].includes(extLower) || mimeLower === "application/pdf") {
        return "pdf";
    }
    if (["doc", "docx", "txt", "md", "rtf", "odt"].includes(extLower) || mimeLower.includes("document") || mimeLower.includes("text/")) {
        return "document";
    }
    if (["xls", "xlsx", "csv"].includes(extLower) || mimeLower.includes("sheet") || mimeLower.includes("excel") || mimeLower.includes("csv")) {
        return "spreadsheet";
    }
    return "other";
};

/**
 * Compute Levenshtein distance between two strings using 2-row DP
 */
const levenshteinDistance = (str1, str2) => {
    const s1 = (str1 || "").toString();
    const s2 = (str2 || "").toString();

    const m = s1.length;
    const n = s2.length;

    if (m === 0) return n;
    if (n === 0) return m;

    let prevRow = Array.from({ length: n + 1 }, (_, i) => i);
    let currRow = new Array(n + 1);

    for (let i = 1; i <= m; i++) {
        currRow[0] = i;
        const char1 = s1[i - 1];

        for (let j = 1; j <= n; j++) {
            const cost = char1 === s2[j - 1] ? 0 : 1;
            currRow[j] = Math.min(
                currRow[j - 1] + 1,      // insertion
                prevRow[j] + 1,          // deletion
                prevRow[j - 1] + cost    // substitution
            );
        }

        prevRow = [...currRow];
    }

    return prevRow[n];
};

/**
 * Normalized Levenshtein ratio: 1 - (dist / max(len1, len2))
 * Returns 1.0 for two empty strings, 0.0 if one is empty
 */
const calculateLevenshteinRatio = (s1, s2) => {
    const str1 = (s1 || "").trim();
    const str2 = (s2 || "").trim();

    if (!str1 && !str2) return 1.0;
    if (!str1 || !str2) return 0.0;
    if (str1 === str2) return 1.0;

    const maxLen = Math.max(str1.length, str2.length);
    const dist = levenshteinDistance(str1, str2);
    return Math.max(0, 1 - dist / maxLen);
};

/**
 * Tokenize normalized string into word tokens
 */
const tokenize = (str) => {
    if (!str || typeof str !== "string") return new Set();
    const tokens = str.toLowerCase().split(/\s+/).filter((t) => t.length > 0);
    return new Set(tokens);
};

/**
 * Jaccard token set similarity: |T1 ∩ T2| / |T1 ∪ T2|
 */
const calculateJaccardSimilarity = (tokens1, tokens2) => {
    const set1 = tokens1 instanceof Set ? tokens1 : tokenize(tokens1);
    const set2 = tokens2 instanceof Set ? tokens2 : tokenize(tokens2);

    if (set1.size === 0 && set2.size === 0) return 1.0;
    if (set1.size === 0 || set2.size === 0) return 0.0;

    let intersectionCount = 0;
    for (const item of set1) {
        if (set2.has(item)) {
            intersectionCount++;
        }
    }

    const unionCount = set1.size + set2.size - intersectionCount;
    if (unionCount === 0) return 1.0;

    return intersectionCount / unionCount;
};

/**
 * Calculate composite name similarity score:
 * Score_name = 0.6 * LevenshteinRatio + 0.4 * Jaccard
 */
const calculateNameSimilarity = (name1, name2) => {
    const norm1 = normalizeBasename(name1);
    const norm2 = normalizeBasename(name2);

    const s1 = norm1.cleanBasename;
    const s2 = norm2.cleanBasename;

    if (s1 === s2 && s1.length > 0) {
        return {
            score: 1.0,
            ratio: 1.0,
            jaccard: 1.0,
            hadCopySuffix: norm1.hadCopySuffix || norm2.hadCopySuffix,
            norm1,
            norm2,
        };
    }

    const ratio = calculateLevenshteinRatio(s1, s2);
    const tokens1 = tokenize(s1);
    const tokens2 = tokenize(s2);
    const jaccard = calculateJaccardSimilarity(tokens1, tokens2);

    const score = Number((0.6 * ratio + 0.4 * jaccard).toFixed(4));

    return {
        score,
        ratio,
        jaccard,
        hadCopySuffix: norm1.hadCopySuffix || norm2.hadCopySuffix,
        norm1,
        norm2,
    };
};

/**
 * Calculate file size similarity based on percentage byte delta:
 * - exact (0% delta): 1.0
 * - <= 1%: 0.9
 * - <= 5%: 0.7
 * - <= 10%: 0.4
 * - > 10%: 0.0
 */
const calculateSizeSimilarity = (size1, size2) => {
    const s1 = Number(size1);
    const s2 = Number(size2);

    if (isNaN(s1) || isNaN(s2) || s1 < 0 || s2 < 0) {
        return { score: 0.0, delta: 1.0, deltaPercent: 100 };
    }

    if (s1 === s2) {
        return { score: 1.0, delta: 0, deltaPercent: 0 };
    }

    const max = Math.max(s1, s2);
    if (max === 0) {
        return { score: 1.0, delta: 0, deltaPercent: 0 };
    }

    const delta = Math.abs(s1 - s2) / max;
    const deltaPercent = Number((delta * 100).toFixed(2));

    let score = 0.0;
    if (delta <= 0.01) {
        score = 0.9;
    } else if (delta <= 0.05) {
        score = 0.7;
    } else if (delta <= 0.10) {
        score = 0.4;
    } else {
        score = 0.0;
    }

    return { score, delta, deltaPercent };
};

/**
 * Calculate file extension / MIME type similarity:
 * - Exact extension match or canonical alias: 1.0
 * - Same general media group: 0.6
 * - Different: 0.0
 */
const calculateTypeSimilarity = (file1, file2) => {
    const ext1 = normalizeExtension(file1?.originalName || file1?.name || file1?.fileName, file1?.mimetype);
    const ext2 = normalizeExtension(file2?.originalName || file2?.name || file2?.fileName, file2?.mimetype);

    if (ext1 && ext2 && ext1 === ext2) {
        return { score: 1.0, ext1, ext2, matchedGroup: ext1 };
    }

    const group1 = getMediaGroup(ext1, file1?.mimetype);
    const group2 = getMediaGroup(ext2, file2?.mimetype);

    if (group1 !== "other" && group1 === group2) {
        return { score: 0.6, ext1, ext2, matchedGroup: group1 };
    }

    return { score: 0.0, ext1, ext2, matchedGroup: null };
};

/**
 * Generate human-readable explanation reasons for a match
 */
const generateMatchExplanations = (fileA, fileB, metrics) => {
    const reasons = [];

    // Size Explanation
    if (metrics.size.score === 1.0) {
        reasons.push(`Exact byte size match (${formatBytes(fileA.size || 0)})`);
    } else if (metrics.size.score >= 0.4) {
        reasons.push(`Nearly identical file size (${metrics.size.deltaPercent}% difference)`);
    }

    // Name Explanation
    const rawA = (fileA.originalName || fileA.name || "").trim().toLowerCase();
    const rawB = (fileB.originalName || fileB.name || "").trim().toLowerCase();

    if (rawA === rawB && rawA.length > 0) {
        reasons.push("Identical filename");
    } else if (metrics.name.norm1.cleanBasename === metrics.name.norm2.cleanBasename && metrics.name.hadCopySuffix) {
        reasons.push(`Matching filename after stripping copy suffixes ("${metrics.name.norm2.cleanBasename}")`);
    } else if (metrics.name.ratio >= 0.85) {
        const percent = Math.round(metrics.name.ratio * 100);
        reasons.push(`High filename similarity (${percent}%) with minor spelling variations`);
    } else if (metrics.name.jaccard >= 0.50) {
        const percent = Math.round(metrics.name.jaccard * 100);
        reasons.push(`Shared token overlap in filename (${percent}%)`);
    }

    // Type Explanation
    if (metrics.type.score === 1.0) {
        const ext = metrics.type.ext1 || metrics.type.ext2;
        reasons.push(`Matching file extension (.${ext}) and MIME format`);
    } else if (metrics.type.score === 0.6) {
        reasons.push(`Same general media type (${metrics.type.matchedGroup})`);
    }

    // Category Explanation (if available)
    if (fileB.category && fileA.category && fileB.category === fileA.category && fileB.category !== "Other") {
        reasons.push(`Same document category ("${fileB.category}")`);
    } else if (fileB.category && fileB.category !== "Other" && !fileA.category) {
        reasons.push(`Identified with existing document category ("${fileB.category}")`);
    }

    return reasons;
};

/**
 * Calculate overall weighted confidence score and classification
 */
const calculateConfidenceScore = (nameMetric, sizeMetric, typeMetric) => {
    let rawScore = (
        WEIGHTS.name * nameMetric.score +
        WEIGHTS.size * sizeMetric.score +
        WEIGHTS.type * typeMetric.score
    );

    // If filename has a copy suffix (e.g. Invoice (1).pdf vs Invoice.pdf),
    // classify as HIGH confidence (capped at 0.92) to strictly distinguish from EXACT identical records.
    if (nameMetric.hadCopySuffix && nameMetric.score === 1.0 && sizeMetric.score === 1.0 && typeMetric.score === 1.0) {
        rawScore = 0.92;
    }

    const similarityScore = Number(rawScore.toFixed(2));

    let confidenceLevel = CONFIDENCE_LEVELS.NONE;
    if (similarityScore >= THRESHOLDS.EXACT && !nameMetric.hadCopySuffix) {
        confidenceLevel = CONFIDENCE_LEVELS.EXACT;
    } else if (similarityScore >= THRESHOLDS.HIGH) {
        confidenceLevel = CONFIDENCE_LEVELS.HIGH;
    } else if (similarityScore >= THRESHOLDS.MODERATE) {
        confidenceLevel = CONFIDENCE_LEVELS.MODERATE;
    }

    const isDuplicate = confidenceLevel !== CONFIDENCE_LEVELS.NONE;

    return {
        similarityScore,
        confidenceLevel,
        isDuplicate,
    };
};

/**
 * Compare an incoming file against a candidate existing file
 */
const compareFiles = (incomingFile, existingFile) => {
    if (!incomingFile || !existingFile) {
        return {
            similarityScore: 0.0,
            confidenceLevel: CONFIDENCE_LEVELS.NONE,
            isDuplicate: false,
            reasons: [],
            metrics: null,
        };
    }

    const nameMetric = calculateNameSimilarity(
        incomingFile.originalName || incomingFile.name,
        existingFile.originalName || existingFile.name
    );

    const sizeMetric = calculateSizeSimilarity(
        incomingFile.size,
        existingFile.size
    );

    const typeMetric = calculateTypeSimilarity(incomingFile, existingFile);

    const { similarityScore, confidenceLevel, isDuplicate } = calculateConfidenceScore(
        nameMetric,
        sizeMetric,
        typeMetric
    );

    const metrics = {
        name: nameMetric,
        size: sizeMetric,
        type: typeMetric,
    };

    const reasons = isDuplicate
        ? generateMatchExplanations(incomingFile, existingFile, metrics)
        : [];

    return {
        similarityScore,
        confidenceLevel,
        isDuplicate,
        reasons,
        metrics: {
            nameScore: nameMetric.score,
            sizeScore: sizeMetric.score,
            typeScore: typeMetric.score,
            levenshteinRatio: nameMetric.ratio,
            jaccardSimilarity: nameMetric.jaccard,
            sizeDeltaPercent: sizeMetric.deltaPercent,
        },
    };
};

/**
 * Search candidate duplicates in a list of existing user files
 * 
 * @param {Object} incomingFile - { originalName, size, mimetype, category }
 * @param {Array<Object>} existingFiles - List of user's existing files
 * @param {Object} [options] - { excludeFileId: string }
 */
const findDuplicates = (incomingFile, existingFiles, options = {}) => {
    // TC-09: Invalid submission handling
    if (
        !incomingFile ||
        typeof incomingFile !== "object" ||
        !incomingFile.originalName ||
        typeof incomingFile.originalName !== "string" ||
        incomingFile.originalName.trim().length === 0 ||
        incomingFile.size === undefined ||
        incomingFile.size === null ||
        isNaN(Number(incomingFile.size)) ||
        Number(incomingFile.size) < 0
    ) {
        return {
            success: false,
            error: "Invalid file attributes: originalName must be a non-empty string and size must be non-negative.",
            isDuplicate: false,
            confidenceLevel: CONFIDENCE_LEVELS.NONE,
            highestScore: 0,
            duplicates: [],
            message: "Validation failed for incoming file attributes.",
        };
    }

    // TC-12: Empty dataset handling
    if (!Array.isArray(existingFiles) || existingFiles.length === 0) {
        return {
            success: true,
            isDuplicate: false,
            confidenceLevel: CONFIDENCE_LEVELS.NONE,
            highestScore: 0,
            duplicates: [],
            message: "No duplicate records detected.",
        };
    }

    const excludeId = options.excludeFileId ? String(options.excludeFileId) : null;
    const candidates = [];

    for (const existing of existingFiles) {
        if (!existing || typeof existing !== "object") {
            continue;
        }

        const fileId = existing._id ? String(existing._id) : (existing.id ? String(existing.id) : null);

        // TC-10: Exclude self during update/rename
        if (excludeId && fileId && excludeId === fileId) {
            continue;
        }

        const comparison = compareFiles(incomingFile, existing);

        if (comparison.isDuplicate) {
            candidates.push({
                fileId,
                fileName: existing.fileName || existing.originalName,
                originalName: existing.originalName || existing.name,
                size: existing.size,
                mimetype: existing.mimetype,
                category: existing.category || "Other",
                createdAt: existing.createdAt || null,
                similarityScore: comparison.similarityScore,
                confidenceLevel: comparison.confidenceLevel,
                reasons: comparison.reasons,
                metrics: comparison.metrics,
            });
        }
    }

    // Sort descending by similarity score
    candidates.sort((a, b) => b.similarityScore - a.similarityScore);

    const isDuplicate = candidates.length > 0;
    const highestScore = isDuplicate ? candidates[0].similarityScore : 0;
    const confidenceLevel = isDuplicate ? candidates[0].confidenceLevel : CONFIDENCE_LEVELS.NONE;

    let message = "No duplicate records detected.";
    if (isDuplicate) {
        const top = candidates[0];
        message = confidenceLevel === CONFIDENCE_LEVELS.EXACT
            ? `Exact duplicate detected: identical to existing file '${top.originalName}'`
            : `Potential duplicate detected: matches existing file '${top.originalName}'`;
    }

    return {
        success: true,
        isDuplicate,
        confidenceLevel,
        highestScore,
        duplicates: candidates,
        message,
    };
};

module.exports = {
    WEIGHTS,
    THRESHOLDS,
    CONFIDENCE_LEVELS,
    formatBytes,
    stripCopySuffix,
    normalizeBasename,
    normalizeExtension,
    getMediaGroup,
    levenshteinDistance,
    calculateLevenshteinRatio,
    tokenize,
    calculateJaccardSimilarity,
    calculateNameSimilarity,
    calculateSizeSimilarity,
    calculateTypeSimilarity,
    calculateConfidenceScore,
    generateMatchExplanations,
    compareFiles,
    findDuplicates,
};
