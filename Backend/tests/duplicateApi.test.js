/**
 * Automated Unit & Integration Tests for Day 4: Duplicate Detection API
 * 
 * Verifies the duplicate-checking API contract (POST /files/check-duplicate)
 * and vault audit API (GET /files/duplicates), including payload validation,
 * response schema conformance, error statuses, and confidence levels.
 */
const assert = require("assert");
const { DuplicateService } = require("../utils/duplicateService");
const { CONFIDENCE_LEVELS } = require("../utils/duplicateEngine");

console.log("=== Running Day 4 Duplicate Detection API Tests ===");

let passed = 0;
let failed = 0;

const runTest = (name, testFn) => {
    try {
        const result = testFn();
        if (result && typeof result.then === "function") {
            return result
                .then(() => {
                    console.log(`[PASS] ${name}`);
                    passed++;
                })
                .catch((err) => {
                    console.error(`[FAIL] ${name}:`, err.message);
                    failed++;
                });
        }
        console.log(`[PASS] ${name}`);
        passed++;
    } catch (err) {
        console.error(`[FAIL] ${name}:`, err.message);
        failed++;
    }
};

// Helper mock to simulate Express request/response pipeline
const createMockReqRes = (body = {}, user = { userId: "test-user-api" }) => {
    const req = {
        body,
        user,
        params: {},
    };

    let statusCode = 200;
    let jsonResponse = null;

    const res = {
        status: (code) => {
            statusCode = code;
            return res;
        },
        json: (data) => {
            jsonResponse = data;
            return res;
        },
        getStatusCode: () => statusCode,
        getResponse: () => jsonResponse,
    };

    return { req, res };
};

// Mock repository with user files
const createMockFileModel = (initialFiles = []) => {
    let files = [...initialFiles];

    return {
        find: (query = {}) => ({
            select: () => ({
                sort: () => {
                    return Promise.resolve(
                        files.filter((f) => {
                            if (query.userId && f.userId !== query.userId) return false;
                            if (query._id && query._id.$ne && String(f._id) === String(query._id.$ne)) return false;
                            return true;
                        })
                    );
                },
            }),
        }),
        findOne: (query = {}) => {
            const found = files.find((f) => {
                if (query._id && String(f._id) !== String(query._id)) return false;
                if (query.userId && f.userId !== query.userId) return false;
                return true;
            });
            return Promise.resolve(found || null);
        },
    };
};

const mockVaultFiles = [
    {
        _id: "api-file-1",
        userId: "test-user-api",
        fileName: "1729000000000-Tax_Return_2025.pdf",
        originalName: "Tax_Return_2025.pdf",
        size: 500000,
        mimetype: "application/pdf",
        category: "Invoice",
        createdAt: new Date("2026-10-10T10:00:00Z"),
    },
    {
        _id: "api-file-2",
        userId: "test-user-api",
        fileName: "1729000000001-Tax_Return_2025 (1).pdf",
        originalName: "Tax_Return_2025 (1).pdf",
        size: 500000,
        mimetype: "application/pdf",
        category: "Invoice",
        createdAt: new Date("2026-10-11T10:00:00Z"),
    },
    {
        _id: "api-file-3",
        userId: "test-user-api",
        fileName: "1729000000002-Company_Logo.png",
        originalName: "Company_Logo.png",
        size: 250000,
        mimetype: "image/png",
        category: "Photo",
        createdAt: new Date("2026-10-12T10:00:00Z"),
    },
];

// Replicate the express handler for POST /check-duplicate with injected service
const handleCheckDuplicate = async (req, res, service) => {
    try {
        const { originalName, size, mimetype, category, excludeFileId } = req.body;
        const userId = req.user?.userId;

        if (!userId) {
            return res.status(401).json({ success: false, error: "Unauthorized" });
        }

        if (!originalName || typeof originalName !== "string" || originalName.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: "originalName is required and must be a non-empty string.",
            });
        }

        if (size === undefined || size === null || isNaN(Number(size)) || Number(size) < 0) {
            return res.status(400).json({
                success: false,
                error: "size is required and must be a non-negative number in bytes.",
            });
        }

        const checkResult = await service.checkDuplicates(
            userId,
            {
                originalName: originalName.trim(),
                size: Number(size),
                mimetype: mimetype || null,
                category: category || null,
            },
            { excludeFileId }
        );

        return res.json(checkResult);
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: "Internal server error checking file duplicates.",
        });
    }
};

// Replicate the express handler for GET /duplicates with injected service
const handleAuditDuplicates = async (req, res, service) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ success: false, error: "Unauthorized" });
        }
        const auditResult = await service.scanUserVault(userId);
        return res.json(auditResult);
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: "Failed to audit user storage vault for duplicates.",
        });
    }
};

async function runAllTests() {
    const service = new DuplicateService(createMockFileModel(mockVaultFiles));

    // 1. Validation error: missing originalName
    await runTest("POST /check-duplicate returns 400 when originalName is missing or empty", async () => {
        const { req, res } = createMockReqRes({ size: 1024 });
        await handleCheckDuplicate(req, res, service);

        assert.strictEqual(res.getStatusCode(), 400);
        const data = res.getResponse();
        assert.strictEqual(data.success, false);
        assert.match(data.error, /originalName is required/i);
    });

    // 2. Validation error: invalid size
    await runTest("POST /check-duplicate returns 400 when size is negative or missing", async () => {
        const { req, res } = createMockReqRes({ originalName: "doc.pdf", size: -10 });
        await handleCheckDuplicate(req, res, service);

        assert.strictEqual(res.getStatusCode(), 400);
        const data = res.getResponse();
        assert.strictEqual(data.success, false);
        assert.match(data.error, /non-negative number/i);
    });

    // 3. Exact Duplicate Contract (TC-01)
    await runTest("POST /check-duplicate returns 200 with EXACT confidence for identical file", async () => {
        const { req, res } = createMockReqRes({
            originalName: "Tax_Return_2025.pdf",
            size: 500000,
            mimetype: "application/pdf",
        });
        await handleCheckDuplicate(req, res, service);

        assert.strictEqual(res.getStatusCode(), 200);
        const data = res.getResponse();
        assert.strictEqual(data.success, true);
        assert.strictEqual(data.isDuplicate, true);
        assert.strictEqual(data.confidenceLevel, CONFIDENCE_LEVELS.EXACT);
        assert.ok(data.highestScore >= 0.95);
        assert.ok(Array.isArray(data.duplicates));
        assert.ok(data.duplicates.length >= 1);

        const top = data.duplicates[0];
        assert.strictEqual(top.originalName, "Tax_Return_2025.pdf");
        assert.ok(top.reasons.length > 0);
        assert.match(data.message, /exact duplicate detected/i);
    });

    // 4. High Confidence Duplicate with copy suffix (TC-04)
    await runTest("POST /check-duplicate identifies copy suffix with HIGH confidence", async () => {
        const { req, res } = createMockReqRes({
            originalName: "Tax_Return_2025 - Copy.pdf",
            size: 500000,
            mimetype: "application/pdf",
        });
        await handleCheckDuplicate(req, res, service);

        assert.strictEqual(res.getStatusCode(), 200);
        const data = res.getResponse();
        assert.strictEqual(data.success, true);
        assert.strictEqual(data.isDuplicate, true);
        assert.strictEqual(data.confidenceLevel, CONFIDENCE_LEVELS.HIGH);
        assert.ok(data.highestScore >= 0.80);
        assert.match(data.message, /potential duplicate detected/i);
    });

    // 5. Clean file with no duplicate detected
    await runTest("POST /check-duplicate returns isDuplicate: false when file is clean", async () => {
        const { req, res } = createMockReqRes({
            originalName: "Unrelated_Spreadsheet.xlsx",
            size: 80000,
            mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        await handleCheckDuplicate(req, res, service);

        assert.strictEqual(res.getStatusCode(), 200);
        const data = res.getResponse();
        assert.strictEqual(data.success, true);
        assert.strictEqual(data.isDuplicate, false);
        assert.strictEqual(data.confidenceLevel, CONFIDENCE_LEVELS.NONE);
        assert.strictEqual(data.duplicates.length, 0);
        assert.strictEqual(data.message, "No duplicate records detected.");
    });

    // 6. Exclude file ID during rename (TC-10)
    await runTest("POST /check-duplicate honors excludeFileId for rename workflows", async () => {
        const { req, res } = createMockReqRes({
            originalName: "Company_Logo.png",
            size: 250000,
            mimetype: "image/png",
            excludeFileId: "api-file-3",
        });
        await handleCheckDuplicate(req, res, service);

        assert.strictEqual(res.getStatusCode(), 200);
        const data = res.getResponse();
        assert.strictEqual(data.success, true);
        assert.strictEqual(data.isDuplicate, false);
        assert.strictEqual(data.duplicates.length, 0);
    });

    // 7. GET /duplicates returns vault audit with duplicate clusters
    await runTest("GET /duplicates audits user vault and returns duplicate groups and wasted bytes", async () => {
        const { req, res } = createMockReqRes();
        await handleAuditDuplicates(req, res, service);

        assert.strictEqual(res.getStatusCode(), 200);
        const data = res.getResponse();
        assert.strictEqual(data.success, true);
        assert.strictEqual(data.fileCount, 3);
        assert.strictEqual(data.duplicateGroupCount, 1);
        assert.strictEqual(data.totalWastedBytes, 500000);
        assert.strictEqual(data.formattedWastedBytes, "488.3 KB");
        assert.ok(data.duplicateGroups.length === 1);
    });

    // 8. GET /duplicates handles clean vault with 0 duplicates
    await runTest("GET /duplicates returns empty clusters for user with no duplicate files", async () => {
        const cleanService = new DuplicateService(createMockFileModel([
            {
                _id: "clean-1",
                userId: "user-clean",
                originalName: "alpha.pdf",
                size: 10000,
                mimetype: "application/pdf",
            },
            {
                _id: "clean-2",
                userId: "user-clean",
                originalName: "beta.jpg",
                size: 20000,
                mimetype: "image/jpeg",
            },
        ]));

        const { req, res } = createMockReqRes({}, { userId: "user-clean" });
        await handleAuditDuplicates(req, res, cleanService);

        assert.strictEqual(res.getStatusCode(), 200);
        const data = res.getResponse();
        assert.strictEqual(data.success, true);
        assert.strictEqual(data.duplicateGroupCount, 0);
        assert.strictEqual(data.totalWastedBytes, 0);
    });

    console.log(`\n=== Test Results: ${passed} Passed, ${failed} Failed ===`);
    if (failed > 0) {
        process.exit(1);
    }
}

runAllTests();
