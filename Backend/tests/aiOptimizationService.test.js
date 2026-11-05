const { test, describe } = require("node:test");
const assert = require("node:assert");
const {
    computeContentHash,
    isUninterpretableOrRandomName,
    cleanTags,
    classifyByRule,
    findExactMatch,
    findSimilarityMatch,
} = require("../services/aiOptimizationService");

describe("AI Optimization Service Tests", () => {
    describe("Content Hash Calculation", () => {
        test("computes identical SHA-256 hash for identical buffers", () => {
            const buf1 = Buffer.from("Quarterly Financial Report Q3");
            const buf2 = Buffer.from("Quarterly Financial Report Q3");
            const hash1 = computeContentHash(buf1);
            const hash2 = computeContentHash(buf2);

            assert.ok(hash1);
            assert.strictEqual(hash1.length, 64);
            assert.strictEqual(hash1, hash2);
        });

        test("computes different hashes for different buffers", () => {
            const buf1 = Buffer.from("Quarterly Financial Report Q3");
            const buf2 = Buffer.from("Quarterly Financial Report Q4");
            assert.notStrictEqual(computeContentHash(buf1), computeContentHash(buf2));
        });

        test("safely handles null or non-buffer inputs", () => {
            assert.strictEqual(computeContentHash(null), null);
            assert.strictEqual(computeContentHash("string"), null);
            assert.strictEqual(computeContentHash(undefined), null);
        });
    });

    describe("Fast Rule-Based Categorizer (0 API Calls)", () => {
        test("classifies image files into Photo category with appropriate tags", () => {
            const res = classifyByRule("family_vacation.jpg", "image/jpeg", "");
            assert.strictEqual(res.matched, true);
            assert.strictEqual(res.category, "Photo");
            assert.ok(res.tags.includes("photo"));
            assert.strictEqual(res.aiSource, "rule_based");
        });

        test("classifies screenshot images into Screenshot category", () => {
            const res = classifyByRule("screenshot_dashboard_error.png", "image/png", "");
            assert.strictEqual(res.matched, true);
            assert.strictEqual(res.category, "Screenshot");
            assert.strictEqual(res.aiSource, "rule_based");
        });

        test("classifies video and audio media files", () => {
            const vid = classifyByRule("tutorial.mp4", "video/mp4", "");
            assert.strictEqual(vid.matched, true);
            assert.strictEqual(vid.category, "Video");

            const aud = classifyByRule("podcast_ep1.mp3", "audio/mpeg", "");
            assert.strictEqual(aud.matched, true);
            assert.strictEqual(aud.category, "Audio");
        });

        test("classifies spreadsheets and presentations", () => {
            const sheet = classifyByRule("annual_budget.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "");
            assert.strictEqual(sheet.matched, true);
            assert.strictEqual(sheet.category, "Spreadsheet");

            const deck = classifyByRule("investor_pitch.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "");
            assert.strictEqual(deck.matched, true);
            assert.strictEqual(deck.category, "Presentation");
        });

        test("classifies resumes and CVs by filename and text keywords", () => {
            const byName = classifyByRule("Piyush_Resume_2026.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "");
            assert.strictEqual(byName.matched, true);
            assert.strictEqual(byName.category, "Resume");

            const byText = classifyByRule("document.pdf", "application/pdf", "Curriculum Vitae of Senior Engineer with extensive work experience and education.");
            assert.strictEqual(byText.matched, true);
            assert.strictEqual(byText.category, "Resume");
        });

        test("classifies invoices and billing receipts by filename and text", () => {
            const byName = classifyByRule("invoice_INV-9821.pdf", "application/pdf", "");
            assert.strictEqual(byName.matched, true);
            assert.strictEqual(byName.category, "Invoice");

            const byText = classifyByRule("doc_991.pdf", "application/pdf", "Invoice Number: 8821\nTotal Amount Due: $1,450.00");
            assert.strictEqual(byText.matched, true);
            assert.strictEqual(byText.category, "Invoice");
        });

        test("classifies legal contracts and agreements", () => {
            const res = classifyByRule("Consulting_Agreement_signed.pdf", "application/pdf", "");
            assert.strictEqual(res.matched, true);
            assert.strictEqual(res.category, "Contract");
        });

        test("returns matched: false for novel arbitrary text documents", () => {
            const res = classifyByRule("research_paper_quantum.pdf", "application/pdf", "Quantum computing represents a paradigm shift in computing theory...");
            assert.strictEqual(res.matched, false);
        });
    });

    describe("Gibberish Filename Detection & Strict Tag Sanitization", () => {
        test("detects keyboard mashing, consonant clusters, and machine hashes as uninterpretable", () => {
            // User's exact file names from screenshots
            assert.strictEqual(
                isUninterpretableOrRandomName("Randomadkjwldlakkdl_wkl_dakldkwlkdakdkwdjajdkjehkf.webp"),
                true
            );
            assert.strictEqual(
                isUninterpretableOrRandomName("original-2092e7963a9052d637e726a7dacc22ac.webp"),
                true
            );
            assert.strictEqual(
                isUninterpretableOrRandomName("adwdadwdawdwdawd-photo.png"),
                true
            );

            // Machine camera prefixes
            assert.strictEqual(isUninterpretableOrRandomName("IMG_20261105_214829.jpg"), true);
            assert.strictEqual(isUninterpretableOrRandomName("DSC_00912.png"), true);
            assert.strictEqual(isUninterpretableOrRandomName("dcim_8912389.jpeg"), true);

            // Hex hashes and UUIDs
            assert.strictEqual(isUninterpretableOrRandomName("a7459f7152e94a664631e8b9c5869596.png"), true);
            assert.strictEqual(isUninterpretableOrRandomName("123e4567-e89b-12d3-a456-426614174000.pdf"), true);
        });

        test("preserves human-readable and meaningful names as interpretable", () => {
            assert.strictEqual(isUninterpretableOrRandomName("gta 6 cover.jpg"), false);
            assert.strictEqual(isUninterpretableOrRandomName("family_vacation.jpg"), false);
            assert.strictEqual(isUninterpretableOrRandomName("Piyush_Resume_2026.docx"), false);
            assert.strictEqual(isUninterpretableOrRandomName("invoice_INV-9821.pdf"), false);
            assert.strictEqual(isUninterpretableOrRandomName("annual_budget.xlsx"), false);
            assert.strictEqual(isUninterpretableOrRandomName("modern-kitchen-interior.png"), false);
            assert.strictEqual(isUninterpretableOrRandomName("sunset_beach.jpg"), false);
        });

        test("cleanTags strips out gibberish words, machine numbers, stopwords, and consonant clusters", () => {
            const rawTags = [
                "photo",
                "image",
                "webp",
                "randomadkjwldlakkdl", // Gibberish consonant spam
                "wkl",                  // 0 vowels
                "original",             // Machine stopword
                "adwdadwdawdwdawd",     // Keyboard stutter / low unique char ratio
                "12345",                // Pure numbers
                "2092e7963a9052d637e726a7dacc22ac", // 32-char hex hash
                "bedroom",
                "wallpaper",
            ];

            const cleaned = cleanTags(rawTags);
            assert.ok(!cleaned.includes("randomadkjwldlakkdl"), "Should have stripped randomadkjwldlakkdl");
            assert.ok(!cleaned.includes("wkl"), "Should have stripped wkl");
            assert.ok(!cleaned.includes("original"), "Should have stripped original");
            assert.ok(!cleaned.includes("adwdadwdawdwdawd"), "Should have stripped adwdadwdawdwdawd");
            assert.ok(!cleaned.includes("12345"), "Should have stripped numbers");
            assert.ok(!cleaned.includes("2092e7963a9052d637e726a7dacc22ac"), "Should have stripped hex hash");
            assert.ok(cleaned.includes("photo"));
            assert.ok(cleaned.includes("image"));
            assert.ok(cleaned.includes("bedroom"));
            assert.ok(cleaned.includes("wallpaper"));
        });
    });

    describe("Exact Hash & Similarity Matchers", () => {
        test("findExactMatch returns matched: false when hash is null or empty", async () => {
            const res = await findExactMatch(null);
            assert.strictEqual(res.matched, false);
        });

        test("findSimilarityMatch returns matched: false when user has no matching files", async () => {
            const res = await findSimilarityMatch("user_non_existent", "test.pdf", ["keyword1"]);
            assert.strictEqual(res.matched, false);
        });
    });
});

