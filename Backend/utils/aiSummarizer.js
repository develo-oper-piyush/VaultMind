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

const generateSummary = async (textContent) => {
    try {
        if (!textContent || textContent.trim().length < 50) {
            return null;
        }

        const textPreview = textContent.substring(0, 2000);

        const prompt = `Summarize the following document in 2-3 concise sentences. Focus on the main points and purpose of the document:

${textPreview}

Provide only the summary, no additional commentary.`;

        const responseText = await generateContentWithFallback(prompt);
        const summary = responseText.trim();

        return summary || null;
    } catch (error) {
        console.error("AI Summarization error:", error.message);
        return null;
    }
};

module.exports = {
    generateSummary,
};
