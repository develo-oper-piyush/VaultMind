const { test, describe } = require("node:test");
const assert = require("node:assert");
const mongoose = require("mongoose");
const {
    DEFAULT_RETENTION_DAYS,
    MAX_ACTIVE_FILES_PER_USER,
    calculateRetentionExpiry,
    countActiveUserFiles,
    countDeletedUserFiles,
    resolveRestoreName,
    softDeleteFile,
    listRecycleBinFiles,
    restoreFileFromTrash,
    permanentlyDeleteFile,
    emptyRecycleBin,
} = require("../services/recycleBin.service");

// Helper to construct mock File documents
const createMockFile = (data = {}) => {
    const doc = {
        _id: data._id || new mongoose.Types.ObjectId(),
        userId: data.userId || "user_test_123",
        fileName: data.fileName || "1729000000000-doc.pdf",
        originalName: data.originalName || "doc.pdf",
        supabasePath: data.supabasePath || `${data.userId || "user_test_123"}/${data.fileName || "1729000000000-doc.pdf"}`,
        size: data.size !== undefined ? data.size : 1024,
        mimetype: data.mimetype || "application/pdf",
        isDeleted: data.isDeleted !== undefined ? data.isDeleted : false,
        deletedAt: data.deletedAt || null,
        deletionExpiresAt: data.deletionExpiresAt || null,
        deletedBy: data.deletedBy || null,
        originalFolder: data.originalFolder || "/",
        currentVersion: data.currentVersion || 1,
        totalVersions: data.totalVersions || 1,
        save: async function () {
            return this;
        },
    };
    return doc;
};

describe("Recycle Bin Service Unit Tests", () => {
    describe("Retention Expiry Calculation", () => {
        test("defaults to 30 days retention window", () => {
            assert.strictEqual(DEFAULT_RETENTION_DAYS, 30);
            assert.strictEqual(MAX_ACTIVE_FILES_PER_USER, 12);
        });

        test("calculates exact 30-day future timestamp", () => {
            const baseDate = new Date("2026-10-18T12:00:00.000Z");
            const expiry = calculateRetentionExpiry(baseDate, 30);

            const diffMs = expiry.getTime() - baseDate.getTime();
            const expectedMs = 30 * 24 * 60 * 60 * 1000;

            assert.strictEqual(diffMs, expectedMs);
            assert.strictEqual(expiry.toISOString(), "2026-11-17T12:00:00.000Z");
        });

        test("accepts custom retention days", () => {
            const baseDate = new Date("2026-10-18T00:00:00.000Z");
            const expiry = calculateRetentionExpiry(baseDate, 7);

            const diffMs = expiry.getTime() - baseDate.getTime();
            assert.strictEqual(diffMs, 7 * 24 * 60 * 60 * 1000);
            assert.strictEqual(expiry.toISOString(), "2026-10-25T00:00:00.000Z");
        });
    });

    describe("resolveRestoreName (Collision Resolution)", () => {
        test("returns original filename unchanged when no conflict exists", () => {
            const activeList = ["notes.txt", "invoice.pdf"];
            const resolved = resolveRestoreName("report.docx", activeList);
            assert.strictEqual(resolved, "report.docx");
        });

        test("appends (restored) when exact filename already exists in active workspace", () => {
            const activeList = ["resume.pdf", "data.csv"];
            const resolved = resolveRestoreName("resume.pdf", activeList);
            assert.strictEqual(resolved, "resume (restored).pdf");
        });

        test("increments counter when (restored) already exists", () => {
            const activeList = ["resume.pdf", "resume (restored).pdf", "data.csv"];
            const resolved = resolveRestoreName("resume.pdf", activeList);
            assert.strictEqual(resolved, "resume (restored 2).pdf");
        });

        test("handles files without extension", () => {
            const activeList = ["README", "LICENSE"];
            const resolved = resolveRestoreName("README", activeList);
            assert.strictEqual(resolved, "README (restored)");
        });

        test("handles files with multiple dots in filename", () => {
            const activeList = ["archive.tar.gz"];
            const resolved = resolveRestoreName("archive.tar.gz", activeList);
            assert.strictEqual(resolved, "archive.tar (restored).gz");
        });
    });

    describe("countActiveUserFiles & countDeletedUserFiles", () => {
        test("counts active non-deleted files correctly", async () => {
            let capturedFilter = null;
            const mockFileModel = {
                countDocuments: async (filter) => {
                    capturedFilter = filter;
                    return 5;
                },
            };

            const count = await countActiveUserFiles("user123", { File: mockFileModel });
            assert.strictEqual(count, 5);
            assert.strictEqual(capturedFilter.userId, "user123");
            assert.deepStrictEqual(capturedFilter.isDeleted, { $ne: true });
        });

        test("counts soft-deleted files correctly", async () => {
            let capturedFilter = null;
            const mockFileModel = {
                countDocuments: async (filter) => {
                    capturedFilter = filter;
                    return 2;
                },
            };

            const count = await countDeletedUserFiles("user123", { File: mockFileModel });
            assert.strictEqual(count, 2);
            assert.strictEqual(capturedFilter.userId, "user123");
            assert.strictEqual(capturedFilter.isDeleted, true);
        });
    });

    describe("softDeleteFile", () => {
        test("moves active file to Recycle Bin and sets 30-day retention expiry", async () => {
            const validId = new mongoose.Types.ObjectId();
            const fileDoc = createMockFile({ _id: validId, userId: "u1", isDeleted: false });

            const mockFileModel = {
                findOne: async () => fileDoc,
            };

            const beforeTime = Date.now();
            const result = await softDeleteFile(validId.toString(), "u1", {}, { File: mockFileModel });

            assert.strictEqual(result.alreadyDeleted, false);
            assert.strictEqual(result.file.isDeleted, true);
            assert.strictEqual(result.file.deletedBy, "u1");
            assert.ok(result.file.deletedAt instanceof Date);
            assert.ok(result.file.deletionExpiresAt instanceof Date);

            const expiryDiff = result.file.deletionExpiresAt.getTime() - result.file.deletedAt.getTime();
            assert.strictEqual(expiryDiff, 30 * 24 * 60 * 60 * 1000);
        });

        test("preserves originalFolder metadata during soft deletion", async () => {
            const validId = new mongoose.Types.ObjectId();
            const fileDoc = createMockFile({ _id: validId, userId: "u1", isDeleted: false });

            const mockFileModel = {
                findOne: async () => fileDoc,
            };

            const result = await softDeleteFile(
                { fileId: validId.toString(), originalFolder: "/Projects/Q4" },
                "u1",
                {},
                { File: mockFileModel }
            );

            assert.strictEqual(result.file.originalFolder, "/Projects/Q4");
        });

        test("supports deletion by fileName for backward compatibility", async () => {
            const fileDoc = createMockFile({ fileName: "123-test.pdf", userId: "u1", isDeleted: false });

            const mockFileModel = {
                findOne: async (filter) => {
                    if (filter.fileName === "123-test.pdf") return fileDoc;
                    return null;
                },
            };

            const result = await softDeleteFile("123-test.pdf", "u1", {}, { File: mockFileModel });
            assert.strictEqual(result.alreadyDeleted, false);
            assert.strictEqual(result.file.isDeleted, true);
        });

        test("returns alreadyDeleted: true if file is already in Recycle Bin", async () => {
            const validId = new mongoose.Types.ObjectId();
            const fileDoc = createMockFile({ _id: validId, userId: "u1", isDeleted: true });

            const mockFileModel = {
                findOne: async () => fileDoc,
            };

            const result = await softDeleteFile(validId.toString(), "u1", {}, { File: mockFileModel });
            assert.strictEqual(result.alreadyDeleted, true);
        });

        test("rejects request if userId is missing with 401", async () => {
            await assert.rejects(
                () => softDeleteFile("some-id", null),
                (err) => err.status === 401
            );
        });

        test("returns 404 when file does not exist or belongs to another user", async () => {
            const validId = new mongoose.Types.ObjectId();
            const mockFileModel = {
                findOne: async () => null,
            };

            await assert.rejects(
                () => softDeleteFile(validId.toString(), "u1", {}, { File: mockFileModel }),
                (err) => err.status === 404
            );
        });
    });

    describe("listRecycleBinFiles", () => {
        test("lists only soft-deleted files for authenticated user with enrichment", async () => {
            const f1Id = new mongoose.Types.ObjectId();
            const now = Date.now();
            const trashedDoc = {
                _id: f1Id,
                userId: "u1",
                fileName: "100-test.pdf",
                originalName: "test.pdf",
                size: 2048,
                mimetype: "application/pdf",
                category: "Document",
                tags: ["sample"],
                summary: "A test file",
                isDeleted: true,
                deletedAt: new Date(now - 86400000), // 1 day ago
                deletionExpiresAt: new Date(now + 29 * 86400000), // 29 days left
                deletedBy: "u1",
                originalFolder: "/Work",
                totalVersions: 3,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            const mockFileModel = {
                find: (filter) => {
                    assert.strictEqual(filter.userId, "u1");
                    assert.strictEqual(filter.isDeleted, true);
                    return {
                        sort: () => ({
                            lean: async () => [trashedDoc],
                        }),
                    };
                },
            };

            const mockFileVersionModel = {
                countDocuments: async () => 3,
            };

            const result = await listRecycleBinFiles("u1", {
                File: mockFileModel,
                FileVersion: mockFileVersionModel,
            });

            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].originalName, "test.pdf");
            assert.strictEqual(result[0].versionCount, 3);
            assert.strictEqual(result[0].daysRemaining, 29);
            assert.strictEqual(result[0].originalFolder, "/Work");
        });

        test("returns empty array when user has no soft-deleted items", async () => {
            const mockFileModel = {
                find: () => ({
                    sort: () => ({
                        lean: async () => [],
                    }),
                }),
            };

            const result = await listRecycleBinFiles("u1", { File: mockFileModel });
            assert.deepStrictEqual(result, []);
        });

        test("rejects missing userId with 401", async () => {
            await assert.rejects(
                () => listRecycleBinFiles(null),
                (err) => err.status === 401
            );
        });
    });

    describe("restoreFileFromTrash", () => {
        test("restores a soft-deleted file back to active workspace", async () => {
            const validId = new mongoose.Types.ObjectId();
            const fileDoc = createMockFile({
                _id: validId,
                userId: "u1",
                originalName: "report.pdf",
                isDeleted: true,
                deletedAt: new Date(),
                deletionExpiresAt: new Date(),
                deletedBy: "u1",
            });

            const mockFileModel = {
                findOne: async () => fileDoc,
                countDocuments: async () => 4, // 4 active files < 12
                find: () => ({
                    select: () => ({
                        lean: async () => [{ originalName: "other.pdf" }],
                    }),
                }),
            };

            const result = await restoreFileFromTrash(validId.toString(), "u1", { File: mockFileModel });

            assert.strictEqual(result.alreadyActive, false);
            assert.strictEqual(result.renamed, false);
            assert.strictEqual(result.restoredName, "report.pdf");
            assert.strictEqual(result.file.isDeleted, false);
            assert.strictEqual(result.file.deletedAt, null);
            assert.strictEqual(result.file.deletionExpiresAt, null);
            assert.strictEqual(result.file.deletedBy, null);
        });

        test("resolves naming collision by appending (restored) suffix", async () => {
            const validId = new mongoose.Types.ObjectId();
            const fileDoc = createMockFile({
                _id: validId,
                userId: "u1",
                originalName: "report.pdf",
                isDeleted: true,
            });

            const mockFileModel = {
                findOne: async () => fileDoc,
                countDocuments: async () => 2,
                find: () => ({
                    select: () => ({
                        // Another active file with identical originalName exists!
                        lean: async () => [{ originalName: "report.pdf" }],
                    }),
                }),
            };

            const result = await restoreFileFromTrash(validId.toString(), "u1", { File: mockFileModel });

            assert.strictEqual(result.renamed, true);
            assert.strictEqual(result.restoredName, "report (restored).pdf");
            assert.strictEqual(result.file.originalName, "report (restored).pdf");
        });

        test("enforces active quota limit of 12 files on restoration", async () => {
            const validId = new mongoose.Types.ObjectId();
            const fileDoc = createMockFile({ _id: validId, userId: "u1", isDeleted: true });

            const mockFileModel = {
                findOne: async () => fileDoc,
                countDocuments: async () => 12, // User already has 12 active files!
            };

            await assert.rejects(
                () => restoreFileFromTrash(validId.toString(), "u1", { File: mockFileModel }),
                (err) => err.status === 400 && err.message.includes("active file quota")
            );
        });

        test("returns alreadyActive: true if file is not deleted", async () => {
            const validId = new mongoose.Types.ObjectId();
            const fileDoc = createMockFile({ _id: validId, userId: "u1", isDeleted: false });

            const mockFileModel = {
                findOne: async () => fileDoc,
            };

            const result = await restoreFileFromTrash(validId.toString(), "u1", { File: mockFileModel });
            assert.strictEqual(result.alreadyActive, true);
        });

        test("rejects invalid ObjectId format with 400", async () => {
            await assert.rejects(
                () => restoreFileFromTrash("malformed-id", "u1"),
                (err) => err.status === 400 && err.message.includes("Invalid file ID format")
            );
        });

        test("returns 404 when file is not found or owned by another user", async () => {
            const validId = new mongoose.Types.ObjectId();
            const mockFileModel = {
                findOne: async () => null,
            };

            await assert.rejects(
                () => restoreFileFromTrash(validId.toString(), "u1", { File: mockFileModel }),
                (err) => err.status === 404
            );
        });
    });

    describe("permanentlyDeleteFile", () => {
        test("rejects permanently deleting a file that is not in Recycle Bin with 400", async () => {
            const validId = new mongoose.Types.ObjectId();
            const fileDoc = createMockFile({ _id: validId, userId: "u1", isDeleted: false });

            const mockFileModel = {
                findOne: async () => fileDoc,
            };

            await assert.rejects(
                () => permanentlyDeleteFile(validId.toString(), "u1", { File: mockFileModel }),
                (err) => err.status === 400 && err.message.includes("Recycle Bin")
            );
        });

        test("cascades deletion across Supabase, FileVersion, DocumentChunk, and File", async () => {
            const validId = new mongoose.Types.ObjectId();
            const fileDoc = createMockFile({
                _id: validId,
                userId: "u1",
                supabasePath: "u1/100-test.pdf",
                isDeleted: true,
            });

            const versionDocs = [
                { storagePath: "u1/versions/file1/v1_test.pdf" },
                { storagePath: "u1/versions/file1/v2_test.pdf" },
            ];

            let removedPaths = null;
            const mockSupabase = {
                storage: {
                    from: () => ({
                        remove: async (paths) => {
                            removedPaths = paths;
                            return { data: paths, error: null };
                        },
                    }),
                },
            };

            let chunksDeleted = false;
            let versionsDeleted = false;
            let fileDeleted = false;

            const mockDocumentChunk = {
                deleteMany: async (filter) => {
                    assert.strictEqual(String(filter.fileId), String(validId));
                    chunksDeleted = true;
                },
            };

            const mockFileVersion = {
                find: () => ({
                    lean: async () => versionDocs,
                }),
                deleteMany: async (filter) => {
                    assert.strictEqual(String(filter.fileId), String(validId));
                    versionsDeleted = true;
                },
            };

            const mockFile = {
                findOne: async () => fileDoc,
                deleteOne: async (filter) => {
                    assert.strictEqual(String(filter._id), String(validId));
                    fileDeleted = true;
                },
            };

            const result = await permanentlyDeleteFile(validId.toString(), "u1", {
                File: mockFile,
                FileVersion: mockFileVersion,
                DocumentChunk: mockDocumentChunk,
                supabase: mockSupabase,
            });

            assert.strictEqual(result.success, true);
            assert.strictEqual(chunksDeleted, true);
            assert.strictEqual(versionsDeleted, true);
            assert.strictEqual(fileDeleted, true);
            assert.strictEqual(removedPaths.length, 3); // Main file + 2 versions
            assert.ok(removedPaths.includes("u1/100-test.pdf"));
        });

        test("halts DB deletion and reports 502 if Supabase storage removal fails", async () => {
            const validId = new mongoose.Types.ObjectId();
            const fileDoc = createMockFile({
                _id: validId,
                userId: "u1",
                supabasePath: "u1/fail.pdf",
                isDeleted: true,
            });

            const mockSupabase = {
                storage: {
                    from: () => ({
                        remove: async () => {
                            return { data: null, error: { message: "Supabase S3 timeout" } };
                        },
                    }),
                },
            };

            let fileDeleted = false;
            const mockFile = {
                findOne: async () => fileDoc,
                deleteOne: async () => {
                    fileDeleted = true;
                },
            };
            const mockFileVersion = {
                find: () => ({ lean: async () => [] }),
                deleteMany: async () => {},
            };
            const mockDocumentChunk = {
                deleteMany: async () => {},
            };

            await assert.rejects(
                () => permanentlyDeleteFile(validId.toString(), "u1", {
                    File: mockFile,
                    FileVersion: mockFileVersion,
                    DocumentChunk: mockDocumentChunk,
                    supabase: mockSupabase,
                }),
                (err) => err.status === 502 && err.message.includes("Supabase S3 timeout")
            );

            // Verified: DB records were NOT deleted
            assert.strictEqual(fileDeleted, false);
        });

        test("rejects invalid ObjectId format with 400", async () => {
            await assert.rejects(
                () => permanentlyDeleteFile("invalid-id", "u1"),
                (err) => err.status === 400
            );
        });
    });

    describe("emptyRecycleBin", () => {
        test("returns clean response when Recycle Bin is already empty", async () => {
            const mockFileModel = {
                find: async () => [],
            };

            const result = await emptyRecycleBin("u1", { File: mockFileModel });
            assert.strictEqual(result.success, true);
            assert.strictEqual(result.count, 0);
            assert.strictEqual(result.deletedCount, 0);
            assert.ok(result.message.includes("empty"));
        });

        test("bulk purges all trashed files across storage and database", async () => {
            const id1 = new mongoose.Types.ObjectId();
            const id2 = new mongoose.Types.ObjectId();

            const trashedFiles = [
                createMockFile({ _id: id1, userId: "u1", supabasePath: "u1/file1.pdf", isDeleted: true }),
                createMockFile({ _id: id2, userId: "u1", supabasePath: "u1/file2.pdf", isDeleted: true }),
            ];

            let removedPaths = null;
            const mockSupabase = {
                storage: {
                    from: () => ({
                        remove: async (paths) => {
                            removedPaths = paths;
                            return { data: paths, error: null };
                        },
                    }),
                },
            };

            let chunksDeleted = false;
            let versionsDeleted = false;
            let filesDeleted = false;

            const mockDocumentChunk = {
                deleteMany: async () => {
                    chunksDeleted = true;
                },
            };

            const mockFileVersion = {
                find: () => ({
                    lean: async () => [{ storagePath: "u1/versions/id1/v1.pdf" }],
                }),
                deleteMany: async () => {
                    versionsDeleted = true;
                },
            };

            const mockFile = {
                find: async () => trashedFiles,
                deleteMany: async (filter) => {
                    assert.strictEqual(filter.userId, "u1");
                    assert.strictEqual(filter.isDeleted, true);
                    filesDeleted = true;
                    return { deletedCount: 2 };
                },
            };

            const result = await emptyRecycleBin("u1", {
                File: mockFile,
                FileVersion: mockFileVersion,
                DocumentChunk: mockDocumentChunk,
                supabase: mockSupabase,
            });

            assert.strictEqual(result.success, true);
            assert.strictEqual(result.deletedCount, 2);
            assert.strictEqual(chunksDeleted, true);
            assert.strictEqual(versionsDeleted, true);
            assert.strictEqual(filesDeleted, true);
            assert.strictEqual(removedPaths.length, 3); // 2 files + 1 version
        });

        test("halts bulk purge if Supabase fails with 502", async () => {
            const id1 = new mongoose.Types.ObjectId();
            const trashedFiles = [
                createMockFile({ _id: id1, userId: "u1", supabasePath: "u1/file1.pdf", isDeleted: true }),
            ];

            const mockSupabase = {
                storage: {
                    from: () => ({
                        remove: async () => ({ data: null, error: { message: "Storage unavailable" } }),
                    }),
                },
            };

            let filesDeleted = false;
            const mockFile = {
                find: async () => trashedFiles,
                deleteMany: async () => {
                    filesDeleted = true;
                },
            };
            const mockFileVersion = {
                find: () => ({ lean: async () => [] }),
                deleteMany: async () => {},
            };
            const mockDocumentChunk = {
                deleteMany: async () => {},
            };

            await assert.rejects(
                () => emptyRecycleBin("u1", {
                    File: mockFile,
                    FileVersion: mockFileVersion,
                    DocumentChunk: mockDocumentChunk,
                    supabase: mockSupabase,
                }),
                (err) => err.status === 502 && err.message.includes("Storage unavailable")
            );

            assert.strictEqual(filesDeleted, false);
        });

        test("rejects missing userId with 401", async () => {
            await assert.rejects(
                () => emptyRecycleBin(null),
                (err) => err.status === 401
            );
        });
    });
});
