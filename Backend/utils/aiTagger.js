const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const CANDIDATE_MODELS = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash-latest",
    "gemini-1.5-flash",
    "gemini-pro",
];

const generateContentWithFallback = async (prompt) => {
    let lastError = null;
    for (const modelName of CANDIDATE_MODELS) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            const response = await result.response;
            return response.text();
        } catch (err) {
            lastError = err;
            console.warn(`Model ${modelName} failed: ${err.message}. Trying next candidate...`);
        }
    }
    throw lastError || new Error("All Gemini model candidates failed");
};

const generateTagsAndCategory = async (fileName, mimetype, textContent) => {
    try {
        const textPreview = textContent
            ? textContent.substring(0, 500)
            : "No text content available";

        const prompt = `Analyze this file and provide tags and category:

Filename: ${fileName}
File Type: ${mimetype}
Content Preview: ${textPreview}

Based on this information, generate:
1. 3-5 relevant tags (keywords that describe the content/purpose)
2. One category from: Invoice, Resume, Contract, Photo, Screenshot, Report, Presentation, Spreadsheet, Document, Video, Audio, Other

Respond ONLY with valid JSON in this exact format:
{
  "tags": ["tag1", "tag2", "tag3"],
  "category": "CategoryName"
}`;

        const responseText = await generateContentWithFallback(prompt);

        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error("No JSON found in response");
        }

        const parsedResult = JSON.parse(jsonMatch[0]);

        if (!parsedResult.tags || !Array.isArray(parsedResult.tags)) {
            parsedResult.tags = [];
        }

        if (!parsedResult.category) {
            parsedResult.category = "Other";
        }

        const validCategories = [
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
        if (!validCategories.includes(parsedResult.category)) {
            parsedResult.category = "Other";
        }

        return parsedResult;
    } catch (error) {
        console.error("AI Tagging error:", error.message);

        const fallbackCategory = mimetype.startsWith("image/")
            ? "Photo"
            : mimetype.startsWith("video/")
              ? "Video"
              : mimetype.startsWith("audio/")
                ? "Audio"
                : mimetype.includes("pdf") || mimetype.includes("document")
                  ? "Document"
                  : "Other";

        return {
            tags: [],
            category: fallbackCategory,
            error: error.message,
        };
    }
};

module.exports = {
    generateTagsAndCategory,
};
