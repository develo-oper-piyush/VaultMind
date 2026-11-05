const crypto = require("crypto");
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const File = require("../models/file.model");
const duplicateEngine = require("../utils/duplicateEngine");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "dummy-key");

const CANDIDATE_MODELS = [
    "gemini-3.5-flash-lite",
    "gemini-3.8-flash",
    "gemini-3.5-flash",
    "gemini-flash-latest",
];

const VALID_CATEGORIES = [
    "Invoice",
    "Resume",
    "Contract",
    "Photo",
    "Screenshot",
    "Report",
    "Presentation",
    "Spreadsheet",
    "Document",
    "Video",
    "Audio",
    "Other",
];

/**
 * Compute SHA-256 hash of a file buffer
 */
const computeContentHash = (buffer) => {
    if (!buffer || !Buffer.isBuffer(buffer)) return null;
    return crypto.createHash("sha256").update(buffer).digest("hex");
};

/**
 * Detects whether a filename is random, machine-generated, or gibberish
 * (e.g. "Randomadkjwldlakkdl_wkl_dakldk...", "original-2092e7963a9052d637e726a7dacc22ac.webp",
 * "adwdadwdawdwdawd-photo.png", "IMG_20261105_214829", "a7459f7152e94a664631", "dcim_98129")
 */
const isUninterpretableOrRandomName = (fileName) => {
    if (!fileName) return true;
    const baseName = fileName.replace(/\.[^/.]+$/, "").trim();
    if (baseName.length < 2) return true;

    // 1. Camera / Device / UUID / Hex / Timestamp / Machine prefixes
    const machinePattern = /^(img|dsc|dcim|pxl|wp|vid|aud|rec|screenshot|capture|upload|image|photo|original)[_ -]?\d+/i;
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const hexPattern = /^[0-9a-f]{10,}$/i;
    const timestampPattern = /^\d{10,}$/;

    if (machinePattern.test(baseName) || uuidPattern.test(baseName) || hexPattern.test(baseName) || timestampPattern.test(baseName)) {
        return true;
    }

    // 2. Token analysis for keyboard mashing, hex hashes, consonant clusters, or lack of vowels
    const tokens = baseName.split(/[-_\s.]+/).filter((t) => t.length > 0);

    for (const token of tokens) {
        // Hex / hash token check (e.g. 2092e7963a9052d637e726a7dacc22ac)
        if (token.length >= 8 && /^[0-9a-f]+$/i.test(token) && /\d/.test(token) && /[a-f]/i.test(token)) {
            return true;
        }

        const lettersOnly = token.toLowerCase().replace(/[^a-z]/g, "");
        if (lettersOnly.length >= 8) {
            // Unique character ratio check (keyboard mashing e.g. "adwdadwdawdwdawd" has 3 unique chars / 16 = 0.18)
            const uniqueChars = new Set(lettersOnly).size;
            const uniqueRatio = uniqueChars / lettersOnly.length;
            if (uniqueRatio < 0.38) {
                return true;
            }
        }

        if (lettersOnly.length >= 6) {
            // 5+ consecutive consonants (e.g. "kjwldl", "kldkwlk")
            if (/[bcdfghjklmnpqrstvwxyz]{5,}/i.test(lettersOnly)) {
                return true;
            }
            // Vowel ratio check: typical English words have 20% - 75% vowels
            const vowels = (lettersOnly.match(/[aeiouy]/g) || []).length;
            const ratio = vowels / lettersOnly.length;
            if (ratio < 0.16 || ratio > 0.85) {
                return true;
            }
        } else if (lettersOnly.length >= 3) {
            // 3-5 character token with 0 vowels (e.g. "wkl", "zxc", "dfg")
            const vowels = (lettersOnly.match(/[aeiouy]/g) || []).length;
            if (vowels === 0) {
                return true;
            }
        }
    }

    // Single unbroken token exceeding 18 chars without recognized separators
    if (tokens.length === 1 && baseName.length >= 18) {
        return true;
    }

    return false;
};

const STOPWORD_TAGS = new Set([
    "original",
    "upload",
    "temp",
    "file",
    "asset",
    "document-file",
    "untitled",
    "image-file",
    "photo-file",
]);

/**
 * Strict Tag Sanitizer:
 * Rejects gibberish words, machine hashes, stop words, or consonant spam from becoming tags
 */
const cleanTags = (tags = []) => {
    if (!Array.isArray(tags)) return ["asset", "document"];
    const validTags = [];

    for (const raw of tags) {
        if (!raw || typeof raw !== "string") continue;
        const tag = raw.toLowerCase().trim().replace(/[^a-z0-9_-]/g, "");

        if (tag.length < 2 || tag.length > 22) continue;
        if (/^\d+$/.test(tag) || /^[0-9a-f]{8,}$/i.test(tag)) continue;
        if (STOPWORD_TAGS.has(tag)) continue;

        // Reject if the tag itself is gibberish or random
        if (isUninterpretableOrRandomName(tag)) continue;

        validTags.push(tag);
    }

    if (validTags.length === 0) {
        return ["asset", "photo"];
    }

    return Array.from(new Set(validTags)).slice(0, 5);
};

/**
 * Fast Rule-Based Categorizer
 * Completely bypasses AI for deterministic media formats and known document templates
 * (Only applies if filename is already meaningful; random/gibberish names trigger vision analysis)
 */
const classifyByRule = (fileName, mimetype = "", textContent = "") => {
    const ext = path.extname(fileName || "").toLowerCase();
    const lowerName = (fileName || "").toLowerCase();
    const lowerText = (textContent || "").slice(0, 1000).toLowerCase();

    // 1. Image / Photo with meaningful name
    if (mimetype.startsWith("image/") || [".jpg", ".jpeg", ".png", ".webp", ".svg", ".gif", ".bmp", ".avif"].includes(ext)) {
        const isScreenshot = lowerName.includes("screenshot") || lowerName.includes("screen_shot") || lowerName.includes("capture");
        const category = isScreenshot ? "Screenshot" : "Photo";
        const isRandom = isUninterpretableOrRandomName(fileName);

        const cleanNameParts = isRandom
            ? []
            : lowerName
                .replace(/\.[^/.]+$/, "")
                .split(/[-_\s]+/)
                .filter((w) => w.length > 2 && !STOPWORD_TAGS.has(w) && !isUninterpretableOrRandomName(w));

        const rawTags = ["photo", "image", ext.replace(".", ""), ...cleanNameParts];
        const tags = cleanTags(rawTags);

        return {
            matched: true,
            category,
            tags,
            summary: isRandom ? `${category} visual asset.` : `${category} visual asset (${fileName}).`,
            aiSource: "rule_based",
        };
    }

    // 2. Video
    if (mimetype.startsWith("video/") || [".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v"].includes(ext)) {
        return {
            matched: true,
            category: "Video",
            tags: cleanTags(["video", "media", ext.replace(".", "")]),
            summary: `Video media asset (${fileName}).`,
            aiSource: "rule_based",
        };
    }

    // 3. Audio
    if (mimetype.startsWith("audio/") || [".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"].includes(ext)) {
        return {
            matched: true,
            category: "Audio",
            tags: cleanTags(["audio", "sound", ext.replace(".", "")]),
            summary: `Audio recording asset (${fileName}).`,
            aiSource: "rule_based",
        };
    }

    // 4. Spreadsheets & Tabular Data
    if ([".xlsx", ".xls", ".csv", ".tsv"].includes(ext) || mimetype.includes("spreadsheet") || mimetype.includes("csv")) {
        return {
            matched: true,
            category: "Spreadsheet",
            tags: cleanTags(["spreadsheet", "data", "tables", ext.replace(".", "")]),
            summary: `Spreadsheet tabular data sheet (${fileName}).`,
            aiSource: "rule_based",
        };
    }

    // 5. Presentations
    if ([".pptx", ".ppt", ".key"].includes(ext) || mimetype.includes("presentation")) {
        return {
            matched: true,
            category: "Presentation",
            tags: cleanTags(["presentation", "slides", "deck", ext.replace(".", "")]),
            summary: `Slide presentation deck (${fileName}).`,
            aiSource: "rule_based",
        };
    }

    // 6. Resumes / CVs (detected via filename or initial header text)
    if (
        lowerName.includes("resume") ||
        lowerName.includes("curriculum_vitae") ||
        lowerName.includes("cv") ||
        lowerText.includes("curriculum vitae") ||
        (lowerText.includes("work experience") && lowerText.includes("education"))
    ) {
        return {
            matched: true,
            category: "Resume",
            tags: cleanTags(["resume", "cv", "career", "professional"]),
            summary: `Curriculum Vitae / Professional Resume document (${fileName}).`,
            aiSource: "rule_based",
        };
    }

    // 7. Invoices / Receipts
    if (
        lowerName.includes("invoice") ||
        lowerName.includes("receipt") ||
        lowerName.includes("bill") ||
        lowerText.includes("invoice number") ||
        lowerText.includes("total amount due")
    ) {
        return {
            matched: true,
            category: "Invoice",
            tags: cleanTags(["invoice", "receipt", "billing", "finance"]),
            summary: `Financial billing invoice receipt (${fileName}).`,
            aiSource: "rule_based",
        };
    }

    // 8. Contracts / Legal Agreements
    if (
        lowerName.includes("contract") ||
        lowerName.includes("agreement") ||
        lowerName.includes("nda") ||
        lowerText.includes("this agreement") ||
        lowerText.includes("terms and conditions")
    ) {
        return {
            matched: true,
            category: "Contract",
            tags: cleanTags(["contract", "agreement", "legal", "terms"]),
            summary: `Legal agreement and contract terms document (${fileName}).`,
            aiSource: "rule_based",
        };
    }

    // 9. Compressed Archives
    if ([".zip", ".rar", ".tar", ".gz", ".7z", ".bz2"].includes(ext)) {
        return {
            matched: true,
            category: "Other",
            tags: cleanTags(["archive", "compressed", "bundle", ext.replace(".", "")]),
            summary: `Compressed archive file bundle (${fileName}).`,
            aiSource: "rule_based",
        };
    }

    return { matched: false };
};

/**
 * Intelligent Image Analysis with Gemini Multimodal Vision:
 * Turns random, uninterpretable image names into smart, meaningful titles and clean tags
 */
const analyzeImageWithAI = async (buffer, mimetype, fileName) => {
    if (!buffer || !Buffer.isBuffer(buffer)) return null;

    let mediaType = mimetype;
    if (!mediaType || mediaType === "application/octet-stream") {
        const ext = path.extname(fileName || "").toLowerCase();
        if (ext === ".png") mediaType = "image/png";
        else if (ext === ".webp") mediaType = "image/webp";
        else if (ext === ".gif") mediaType = "image/gif";
        else mediaType = "image/jpeg";
    }

    const base64Data = buffer.toString("base64");

    const prompt = `You are an intelligent visual asset categorizer for a cloud drive.
Analyze this image and return strict JSON:

1. "suggestedTitle": A natural, concise human-readable title (3 to 5 words, Title Case) accurately describing what is depicted (e.g. "Botanical Bedroom Wallpaper", "Mountain Valley Sunset", "Modern Kitchen Interior"). Do NOT include file extension or special characters.
2. "tags": 3 to 5 lowercase, relevant descriptive tags (e.g. ["bedroom", "interior", "wallpaper", "decor"]). No random or meaningless words.
3. "category": Choose one strictly from: "Photo", "Screenshot", "Document".
4. "summary": A 1-2 sentence description of what is shown.

JSON output only:
{
  "suggestedTitle": "Title Here",
  "category": "Photo",
  "tags": ["tag1", "tag2", "tag3"],
  "summary": "1-2 sentence description."
}`;

    for (const modelName of CANDIDATE_MODELS) {
        try {
            const model = genAI.getGenerativeModel({
                model: modelName,
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 250,
                },
            });

            const result = await model.generateContent([
                {
                    inlineData: {
                        data: base64Data,
                        mimeType: mediaType,
                    },
                },
                prompt,
            ]);

            const responseText = (await result.response).text();
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                const suggestedTitle = typeof parsed.suggestedTitle === "string" ? parsed.suggestedTitle.replace(/[/\\?%*:|"<>]/g, "").trim() : null;
                const category = VALID_CATEGORIES.includes(parsed.category) ? parsed.category : "Photo";
                const tags = cleanTags(parsed.tags);
                const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : `Visual photo asset.`;

                return {
                    suggestedTitle,
                    category,
                    tags,
                    summary,
                    aiSource: "gemini_vision",
                };
            }
        } catch (err) {
            console.warn(`Vision model ${modelName} failed during smart image titling: ${err.message}. Trying next candidate...`);
        }
    }

    return null;
};

/**
 * Find exact hash match in database (0 API Calls)
 */
const findExactMatch = async (contentHash, excludeId = null) => {
    if (!contentHash) return { matched: false };
    const mongoose = require("mongoose");
    if (mongoose.connection.readyState !== 1) return { matched: false };

    try {
        const query = {
            contentHash,
            "processingStatus.tagged": true,
            isDeleted: { $ne: true },
        };
        if (excludeId) query._id = { $ne: excludeId };

        const match = await File.findOne(query)
            .select("tags category summary originalName")
            .lean();

        if (match && match.category) {
            return {
                matched: true,
                category: match.category,
                tags: cleanTags(match.tags),
                summary: match.summary || null,
                originalName: match.originalName || null,
                aiSource: "inherited_hash",
            };
        }
    } catch (err) {
        console.warn("Exact hash match lookup note:", err.message);
    }
    return { matched: false };
};

/**
 * Find high-similarity match in existing user vault (0 API Calls)
 * Uses Jaccard similarity of extracted keywords and filename Levenshtein ratio
 */
const findSimilarityMatch = async (userId, fileName, keywords = [], excludeId = null) => {
    if (!userId || (!keywords.length && !fileName)) return { matched: false };
    const mongoose = require("mongoose");
    if (mongoose.connection.readyState !== 1) return { matched: false };

    try {
        const query = {
            userId,
            "processingStatus.tagged": true,
            isDeleted: { $ne: true },
        };
        if (excludeId) query._id = { $ne: excludeId };

        const candidates = await File.find(query)
            .select("_id originalName category tags keywords summary")
            .limit(20)
            .lean();

        if (!candidates || candidates.length === 0) return { matched: false };

        let bestCandidate = null;
        let highestScore = 0;

        for (const cand of candidates) {
            let score = 0;

            if (keywords.length > 0 && Array.isArray(cand.keywords) && cand.keywords.length > 0) {
                const candSet = new Set(cand.keywords.map((k) => k.toLowerCase()));
                let matches = 0;
                keywords.forEach((k) => {
                    if (candSet.has(k.toLowerCase())) matches++;
                });
                const union = new Set([...keywords.map((k) => k.toLowerCase()), ...candSet]).size;
                const jaccard = union > 0 ? matches / union : 0;
                score += jaccard * 0.7;
            }

            if (fileName && cand.originalName) {
                const nameSim = duplicateEngine.calculateLevenshteinRatio(
                    duplicateEngine.normalizeBasename(fileName),
                    duplicateEngine.normalizeBasename(cand.originalName)
                );
                score += nameSim * 0.3;
            }

            if (score > highestScore) {
                highestScore = score;
                bestCandidate = cand;
            }
        }

        if (highestScore >= 0.65 && bestCandidate && bestCandidate.category) {
            return {
                matched: true,
                category: bestCandidate.category,
                tags: cleanTags(bestCandidate.tags),
                summary: bestCandidate.summary || null,
                aiSource: "inherited_similarity",
            };
        }
    } catch (err) {
        console.warn("Similarity match lookup note:", err.message);
    }
    return { matched: false };
};

/**
 * Consolidated Gemini AI Call (For novel text documents)
 * Also generates a smart title if the original document name is random/gibberish
 */
const generateOptimizedAIAnalysis = async (fileName, mimetype, textContent) => {
    const truncatedText = (textContent || "").slice(0, 2000).trim();
    const isRandom = isUninterpretableOrRandomName(fileName);

    const prompt = `Analyze this document and provide metadata in strict JSON:

Filename: ${fileName}
MIME Type: ${mimetype}
Document Text:
"""
${truncatedText || "No text extract available."}
"""

Task:
1. ${isRandom ? '"suggestedTitle": A concise, natural title (3 to 6 words) based on the document topic/heading.' : '"suggestedTitle": null,'}
2. "tags": 3-5 relevant lowercase tags. (No random or gibberish characters).
3. "category": Choose one category strictly from: ${VALID_CATEGORIES.join(", ")}.
4. "summary": Write a concise 2-sentence summary of the main purpose and content.

Output JSON ONLY:
{
  "suggestedTitle": ${isRandom ? '"Document Title Here"' : 'null'},
  "tags": ["tag1", "tag2", "tag3"],
  "category": "Document",
  "summary": "Concise 2-sentence summary here."
}`;

    for (const modelName of CANDIDATE_MODELS) {
        try {
            const model = genAI.getGenerativeModel({
                model: modelName,
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 250,
                },
            });

            const result = await model.generateContent(prompt);
            const responseText = (await result.response).text();

            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                const suggestedTitle = typeof parsed.suggestedTitle === "string" ? parsed.suggestedTitle.replace(/[/\\?%*:|"<>]/g, "").trim() : null;
                const tags = cleanTags(parsed.tags);
                const category = VALID_CATEGORIES.includes(parsed.category) ? parsed.category : "Document";
                const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : null;

                return {
                    suggestedTitle,
                    category,
                    tags,
                    summary,
                    aiSource: "gemini_generated",
                };
            }
        } catch (err) {
            console.warn(`Model ${modelName} failed during optimized AI analysis: ${err.message}. Trying next candidate...`);
        }
    }

    return {
        suggestedTitle: null,
        category: mimetype.startsWith("image/") ? "Photo" : "Document",
        tags: cleanTags([mimetype ? mimetype.split("/")[0] : "file"]),
        summary: `Document asset (${fileName}).`,
        aiSource: "rule_based",
    };
};

/**
 * Master Document AI Pipeline Orchestrator
 */
const processDocumentAI = async ({ fileDoc, fileBuffer, textContent, keywords = [] }) => {
    const ext = path.extname(fileDoc.originalName || "").toLowerCase();
    const isRandomName = isUninterpretableOrRandomName(fileDoc.originalName);
    const contentHash = computeContentHash(fileBuffer);

    // 1. Check exact hash cache across existing files (0 API calls)
    const exactMatch = await findExactMatch(contentHash, fileDoc._id);
    if (exactMatch.matched) {
        console.log(`[AI Optimizer] Inherited tags and category via exact content hash for: ${fileDoc.fileName} (0 Gemini API calls)`);
        // If incoming name was random but matching file had a good name, inherit the good name
        let smartTitle = null;
        if (isRandomName && exactMatch.originalName && !isUninterpretableOrRandomName(exactMatch.originalName)) {
            smartTitle = exactMatch.originalName;
        }

        return {
            contentHash,
            category: exactMatch.category,
            tags: exactMatch.tags,
            summary: exactMatch.summary,
            smartTitle,
            aiSource: "inherited_hash",
        };
    }

    // 2. If it's an image:
    const isImage = fileDoc.mimetype?.startsWith("image/") || [".jpg", ".jpeg", ".png", ".webp", ".svg", ".gif", ".bmp"].includes(ext);
    if (isImage) {
        if (!isRandomName) {
            // Filename is already human-readable and meaningful -> Fast rule categorizer (0 API calls!)
            const ruleMatch = classifyByRule(fileDoc.originalName, fileDoc.mimetype, textContent);
            if (ruleMatch.matched) {
                console.log(`[AI Optimizer] Meaningful image name detected -> Rule-based fast categorizer for: ${fileDoc.fileName}`);
                return {
                    contentHash,
                    category: ruleMatch.category,
                    tags: ruleMatch.tags,
                    summary: ruleMatch.summary,
                    smartTitle: null,
                    aiSource: "rule_based",
                };
            }
        } else {
            // Filename is gibberish/random (e.g. "Randomadkjwldlakkdl_wkl_dakldk...")
            // Run multimodal AI to give it a smart, interpretable title and clean descriptive tags!
            console.log(`[AI Optimizer] Gibberish image name detected (${fileDoc.originalName}). Invoking smart visual naming & tagging...`);
            const visionResult = await analyzeImageWithAI(fileBuffer, fileDoc.mimetype, fileDoc.originalName);
            if (visionResult && visionResult.suggestedTitle) {
                const smartTitle = `${visionResult.suggestedTitle}${ext}`;
                return {
                    contentHash,
                    category: visionResult.category,
                    tags: visionResult.tags,
                    summary: visionResult.summary,
                    smartTitle,
                    aiSource: "gemini_vision",
                };
            }
            // Fallback if vision API unavailable
            const fallbackTags = cleanTags(["photo", "gallery", "image", "visual-asset", ext.replace(".", "")]);
            const smartTitle = `Photo_${Date.now().toString().slice(-4)}${ext}`;
            return {
                contentHash,
                category: "Photo",
                tags: fallbackTags,
                summary: `Visual photo asset.`,
                smartTitle,
                aiSource: "rule_based",
            };
        }
    }

    // 3. Fast Rule-Based Categorization for other deterministic types (Audio, Video, Spreadsheets, Archives)
    const ruleMatch = classifyByRule(fileDoc.originalName, fileDoc.mimetype, textContent);
    if (ruleMatch.matched) {
        console.log(`[AI Optimizer] Rule-based fast classification for: ${fileDoc.fileName} -> ${ruleMatch.category} (0 Gemini API calls)`);
        return {
            contentHash,
            category: ruleMatch.category,
            tags: ruleMatch.tags,
            summary: ruleMatch.summary,
            smartTitle: null,
            aiSource: "rule_based",
        };
    }

    // 4. Check for semantic similarity in user's vault (0 API calls)
    const similarityMatch = await findSimilarityMatch(fileDoc.userId, fileDoc.originalName, keywords, fileDoc._id);
    if (similarityMatch.matched) {
        console.log(`[AI Optimizer] Inherited tags and category via semantic similarity for: ${fileDoc.fileName} -> ${similarityMatch.category} (0 Gemini API calls)`);
        return {
            contentHash,
            category: similarityMatch.category,
            tags: similarityMatch.tags,
            summary: similarityMatch.summary,
            smartTitle: null,
            aiSource: "inherited_similarity",
        };
    }

    // 5. Novel Document: Run consolidated Gemini AI analysis with token truncation
    console.log(`[AI Optimizer] Novel document detected. Invoking consolidated Gemini AI analysis for: ${fileDoc.fileName}`);
    const aiAnalysis = await generateOptimizedAIAnalysis(fileDoc.originalName, fileDoc.mimetype, textContent);

    let smartTitle = null;
    if (isRandomName && aiAnalysis.suggestedTitle) {
        smartTitle = `${aiAnalysis.suggestedTitle}${ext}`;
    }

    return {
        contentHash,
        category: aiAnalysis.category,
        tags: aiAnalysis.tags,
        summary: aiAnalysis.summary,
        smartTitle,
        aiSource: aiAnalysis.aiSource || "gemini_generated",
    };
};

module.exports = {
    computeContentHash,
    isUninterpretableOrRandomName,
    cleanTags,
    classifyByRule,
    analyzeImageWithAI,
    findExactMatch,
    findSimilarityMatch,
    generateOptimizedAIAnalysis,
    processDocumentAI,
};
