const mongoose = require("mongoose");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const supabase = require("../config/supabase");
const File = require("../models/file.model");
const DocumentChunk = require("../models/documentChunk.model");
const { chunkDocument } = require("../utils/chunkingEngine");
const { normalizeExtractedText } = require("../utils/textExtractor");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

const OCR_CANDIDATE_MODELS = [
    "gemini-3.5-flash-lite",
    "gemini-3.8-flash",
    "gemini-3.5-flash",
    "gemini-flash-latest",
];

/**
 * Check if the file's mimetype or extension supports OCR processing
 */
const isOcrSupported = (mimetype, filename = "") => {
    if (!mimetype) return false;
    const lowerType = mimetype.toLowerCase();
    const lowerName = filename.toLowerCase();

    const isImage =
        lowerType.startsWith("image/") ||
        [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff", ".gif"].some((ext) =>
            lowerName.endsWith(ext)
        );

    const isPdf =
        lowerType === "application/pdf" || lowerName.endsWith(".pdf");

    return isImage || isPdf;
};

/**
 * Performs OCR text extraction using Google Gemini Multimodal Vision API
 * Implements strict caching to protect API quota and reduce latency.
 */
const performOcrOnFile = async (fileId, userId) => {
    const uId = userId?.toString();
    const query = {
        $or: [{ userId: uId }, { userId }],
        isDeleted: { $ne: true },
    };

    if (mongoose.Types.ObjectId.isValid(fileId)) {
        query.$and = [{ $or: [{ _id: fileId }, { fileName: fileId }] }];
    } else {
        query.fileName = fileId;
    }

    const file = await File.findOne(query);
    if (!file) {
        throw new Error("File not found or has been deleted");
    }

    // 1. Quota-protection: check if OCR was already executed and cached
    if (file.ocrProcessed && file.ocrText) {
        const wordCount = file.ocrText.trim().split(/\s+/).filter(Boolean).length;
        return {
            success: true,
            text: file.ocrText,
            cached: true,
            wordCount,
            characterCount: file.ocrText.length,
            file: {
                id: file._id,
                name: file.originalName || file.fileName,
                mimetype: file.mimetype,
            },
        };
    }

    if (!isOcrSupported(file.mimetype, file.originalName || file.fileName)) {
        throw new Error(
            `File type '${file.mimetype}' is not supported for optical character recognition (OCR).`
        );
    }

    // 2. Fetch raw file buffer from storage
    const storagePath = `${userId}/${file.fileName}`;
    const { data: storageData, error: storageError } = await supabase.storage
        .from("Files-upload")
        .download(storagePath);

    if (storageError || !storageData) {
        throw new Error(
            `Failed to download file from storage: ${storageError?.message || "File data missing"}`
        );
    }

    const buffer = Buffer.from(await storageData.arrayBuffer());
    if (buffer.length === 0) {
        throw new Error("File is empty (0 bytes). OCR cannot be performed.");
    }

    // Determine MIME type for multimodal model
    let mediaType = file.mimetype;
    if (!mediaType || mediaType === "application/octet-stream") {
        const ext = (file.originalName || file.fileName).split(".").pop().toLowerCase();
        if (ext === "png") mediaType = "image/png";
        else if (ext === "jpg" || ext === "jpeg") mediaType = "image/jpeg";
        else if (ext === "webp") mediaType = "image/webp";
        else if (ext === "pdf") mediaType = "application/pdf";
        else mediaType = "image/jpeg";
    }

    const base64Data = buffer.toString("base64");

    // 3. Call Gemini with minimal token footprint & deterministic parameters
    const prompt = `You are a high-accuracy OCR engine.
Extract all readable text, titles, numbers, tables, and notes present in this document or image accurately.
Rules:
- Output ONLY the extracted text layout.
- Do not provide conversational filler, markdown formatting blocks (like \`\`\`text), or greetings.
- If absolutely no readable text, handwriting, or numbers are detected, respond with: "[No readable text detected]"`;

    let extractedText = null;
    let lastError = null;

    for (const modelName of OCR_CANDIDATE_MODELS) {
        try {
            const model = genAI.getGenerativeModel({
                model: modelName,
                generationConfig: {
                    temperature: 0.0, // Deterministic for high accuracy
                    maxOutputTokens: 2048, // Quota protection
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

            const response = await result.response;
            extractedText = response.text();
            if (extractedText) break;
        } catch (err) {
            lastError = err;
            console.warn(`OCR model candidate ${modelName} failed: ${err.message}. Retrying next candidate...`);
        }
    }

    if (!extractedText) {
        throw lastError || new Error("Failed to extract text using OCR models.");
    }

    // Clean up text
    let cleanText = normalizeExtractedText(extractedText);
    if (cleanText.startsWith("```") && cleanText.endsWith("```")) {
        cleanText = cleanText.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "").trim();
    }

    // 4. Cache results in MongoDB
    file.ocrText = cleanText;
    file.ocrProcessed = true;
    if (!file.textContent || file.textContent.trim().length === 0) {
        file.textContent = cleanText;
    }
    file.processingStatus.textExtracted = true;
    await file.save();

    // 5. If document not yet chunked, chunk it now so "Ask VaultMind" can use it
    try {
        const existingChunks = await DocumentChunk.countDocuments({ fileId: file._id });
        if (existingChunks === 0 && cleanText.length > 20 && cleanText !== "[No readable text detected]") {
            const chunkingResult = chunkDocument(cleanText, file.originalName || file.fileName);
            if (chunkingResult && chunkingResult.chunks && chunkingResult.chunks.length > 0) {
                const chunksToInsert = chunkingResult.chunks.map((c) => ({
                    fileId: file._id,
                    userId,
                    chunkIndex: c.chunkIndex,
                    text: c.text,
                    charStart: c.charStart,
                    charEnd: c.charEnd,
                    pageNumber: c.pageNumber || 1,
                    keywords: c.keywords || [],
                }));
                await DocumentChunk.insertMany(chunksToInsert);
                file.chunkCount = chunksToInsert.length;
                file.processingStatus.chunked = true;
                file.processingStatus.indexed = true;
                await file.save();
            }
        }
    } catch (chunkErr) {
        console.error("Error auto-chunking OCR text:", chunkErr.message);
    }

    const wordCount = cleanText.trim().split(/\s+/).filter(Boolean).length;

    return {
        success: true,
        text: cleanText,
        cached: false,
        wordCount,
        characterCount: cleanText.length,
        file: {
            id: file._id,
            name: file.originalName || file.fileName,
            mimetype: file.mimetype,
        },
    };
};

module.exports = {
    isOcrSupported,
    performOcrOnFile,
};

