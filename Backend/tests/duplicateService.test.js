/**
 * Automated Unit Tests for Day 3: Backend Duplicate Service Integration
 * 
 * Verifies data-access layer integration, authoritative upload validation,
 * bypass flag handling (allowDuplicate), rename conflict checks, and workspace vault auditing.
 */
const assert = require("assert");
const { DuplicateService } = require("../utils/duplicateService");
const { CONFIDENCE_LEVELS } = require("../utils/duplicateEngine");

console.log("=== Running Day 3 Backend Duplicate Detection Service Tests ===");

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

// Create an in-memory mock repository for Mongoose File model
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
        _setFiles: (newFiles) => {
            files = [...newFiles];
        },
    };
};

const mockFiles = [
    {
        _id: "mongo-file-1",
        userId: "user-alpha",
        fileName: "1729000000000-Financial_Report_Q3.pdf",
        originalName: "Financial_Report_Q3.pdf",
        size: 1048576,
        mimetype: "application/pdf",
        category: "Report",
        createdAt: new Date("2026-10-15T10:00:00Z"),
    },
    {
        _id: "mongo-file-2",
        userId: "user-alpha",
        fileName: "1729000000001-Design_Mockup.png",
        originalName: "Design_Mockup.png",
        size: 524288,
        mimetype: "image/png",
        category: "Photo",
        createdAt: new Date("2026-10-15T11:00:00Z"),
    },
    {
        _id: "mongo-file-3",
        userId: "user-beta",
        fileName: "1729000000002-Other_User_File.pdf",
        originalName: "Financial_Report_Q3.pdf",
        size: 1048576,
        mimetype: "application/pdf",
        category: "Report",
        createdAt: new Date("2026-10-15T12:00:00Z"),
    },
];

async function runAllTests() {
    // 1. User file data isolation
    await runTest("getUserFiles retrieves and isolates files scoped strictly to userId", async () => {
        const mockModel = createMockFileModel(mockFiles);
        const service = new DuplicateService(mockModel);

        const alphaFiles = await service.getUserFiles("user-alpha");
        assert.strictEqual(alphaFiles.length, 2);
        assert.ok(alphaFiles.every((f) => f.userId === "user-alpha"));

        const betaFiles = await service.getUserFiles("user-beta");
        assert.strictEqual(betaFiles.length, 1);
        assert.strictEqual(betaFiles[0]._id, "mongo-file-3");
    });

    // 2. excludeFileId filter in getUserFiles
    await runTest("getUserFiles respects excludeFileId option", async () => {
        const mockModel = createMockFileModel(mockFiles);
        const service = new DuplicateService(mockModel);

        const filtered = await service.getUserFiles("user-alpha", { excludeFileId: "mongo-file-1" });
        assert.strictEqual(filtered.length, 1);
        assert.strictEqual(filtered[0]._id, "mongo-file-2");
    });

    // 3. checkDuplicates integration
    await runTest("checkDuplicates runs engine against database records", async () => {
        const mockModel = createMockFileModel(mockFiles);
        const service = new DuplicateService(mockModel);

        const result = await service.checkDuplicates("user-alpha", {
            originalName: "Financial_Report_Q3.pdf",
            size: 1048576,
            mimetype: "application/pdf",
        });

        assert.strictEqual(result.success, true);
        assert.strictEqual(result.isDuplicate, true);
        assert.strictEqual(result.confidenceLevel, CONFIDENCE_LEVELS.EXACT);
        assert.strictEqual(result.duplicates.length, 1);
    });

    // 4. Authoritative upload validation: block exact duplicate
    await runTest("validateUpload rejects exact duplicate upload with 409 status", async () => {
        const mockModel = createMockFileModel(mockFiles);
        const service = new DuplicateService(mockModel);

        const file = {
            name: "Financial_Report_Q3.pdf",
            size: 1048576,
            mimetype: "application/pdf",
        };

        const result = await service.validateUpload("user-alpha", file, false);
        assert.strictEqual(result.allowed, false);
        assert.strictEqual(result.statusCode, 409);
        assert.strictEqual(result.isDuplicate, true);
        assert.strictEqual(result.confidenceLevel, CONFIDENCE_LEVELS.EXACT);
        assert.match(result.error, /duplicate file detected/i);
    });

    // 5. Authoritative upload validation: block high-confidence copy-suffix duplicate
    await runTest("validateUpload rejects copy-suffix duplicate (Invoice (1).pdf)", async () => {
        const mockModel = createMockFileModel(mockFiles);
        const service = new DuplicateService(mockModel);

        const file = {
            name: "Financial_Report_Q3 (1).pdf",
            size: 1048576,
            mimetype: "application/pdf",
        };

        const result = await service.validateUpload("user-alpha", file, false);
        assert.strictEqual(result.allowed, false);
        assert.strictEqual(result.statusCode, 409);
        assert.strictEqual(result.confidenceLevel, CONFIDENCE_LEVELS.HIGH);
    });

    // 6. User bypass via allowDuplicate
    await runTest("validateUpload permits duplicate when allowDuplicate: true", async () => {
        const mockModel = createMockFileModel(mockFiles);
        const service = new DuplicateService(mockModel);

        const file = {
            name: "Financial_Report_Q3.pdf",
            size: 1048576,
            mimetype: "application/pdf",
        };

        // string "true" or boolean true
        const resBool = await service.validateUpload("user-alpha", file, true);
        assert.strictEqual(resBool.allowed, true);
        assert.strictEqual(resBool.bypassed, true);

        const resStr = await service.validateUpload("user-alpha", file, "true");
        assert.strictEqual(resStr.allowed, true);
        assert.strictEqual(resStr.bypassed, true);
    });

    // 7. Clean upload allowed
    await runTest("validateUpload permits clean non-duplicate files", async () => {
        const mockModel = createMockFileModel(mockFiles);
        const service = new DuplicateService(mockModel);

        const cleanFile = {
            name: "Entirely_New_Presentation.pptx",
            size: 3145728,
            mimetype: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        };

        const result = await service.validateUpload("user-alpha", cleanFile, false);
        assert.strictEqual(result.allowed, true);
        assert.strictEqual(result.bypassed, false);
        assert.strictEqual(result.isDuplicate, false);
    });

    // 8. Rename collision check
    await runTest("validateRename prevents renaming to an existing duplicate", async () => {
        const mockModel = createMockFileModel([
            {
                _id: "doc-1",
                userId: "user-alpha",
                originalName: "Budget_2026.xlsx",
                size: 20000,
                mimetype: "application/vnd.ms-excel",
            },
            {
                _id: "doc-2",
                userId: "user-alpha",
                originalName: "Draft_Budget.xlsx",
                size: 20000,
                mimetype: "application/vnd.ms-excel",
            },
        ]);
        const service = new DuplicateService(mockModel);

        // Attempt to rename doc-2 to "Budget_2026.xlsx"
        const result = await service.validateRename("user-alpha", "doc-2", "Budget_2026.xlsx");
        assert.strictEqual(result.allowed, false);
        assert.strictEqual(result.isDuplicate, true);
    });

    // 9. Rename self-exclusion
    await runTest("validateRename permits keeping same name without colliding with self", async () => {
        const mockModel = createMockFileModel([
            {
                _id: "doc-1",
                userId: "user-alpha",
                originalName: "Budget_2026.xlsx",
                size: 20000,
                mimetype: "application/vnd.ms-excel",
            },
        ]);
        const service = new DuplicateService(mockModel);

        const result = await service.validateRename("user-alpha", "doc-1", "Budget_2026.xlsx");
        assert.strictEqual(result.allowed, true);
        assert.strictEqual(result.isDuplicate, false);
    });

    // 10. scanUserVault identifies duplicate clusters & wasted storage
    await runTest("scanUserVault clusters duplicate files and computes wasted byte quota", async () => {
        const mockVault = [
            {
                _id: "f-1",
                userId: "user-gamma",
                originalName: "Quarterly_Summary.pdf",
                size: 2000000,
                mimetype: "application/pdf",
                category: "Report",
            },
            {
                _id: "f-2",
                userId: "user-gamma",
                originalName: "Quarterly_Summary (1).pdf",
                size: 2000000,
                mimetype: "application/pdf",
                category: "Report",
            },
            {
                _id: "f-3",
                userId: "user-gamma",
                originalName: "Unrelated_Image.jpg",
                size: 500000,
                mimetype: "image/jpeg",
                category: "Photo",
            },
        ];

        const mockModel = createMockFileModel(mockVault);
        const service = new DuplicateService(mockModel);

        const audit = await service.scanUserVault("user-gamma");
        assert.strictEqual(audit.success, true);
        assert.strictEqual(audit.fileCount, 3);
        assert.strictEqual(audit.duplicateGroupCount, 1);
        assert.strictEqual(audit.duplicateGroups.length, 1);
        assert.strictEqual(audit.duplicateGroups[0].redundantCount, 1);
        assert.strictEqual(audit.totalWastedBytes, 2000000);
        assert.strictEqual(audit.formattedWastedBytes, "1.9 MB");
    });

    console.log(`\n=== Test Results: ${passed} Passed, ${failed} Failed ===`);
    if (failed > 0) {
        process.exit(1);
    }
}

runAllTests();
