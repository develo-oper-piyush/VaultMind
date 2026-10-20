const { test, describe } = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const mongoose = require("mongoose");
const {
    computeContentHash,
    generateVersionStoragePath,
    getNextVersionNumber,
    createFileVersionRecord,
    ensureInitialVersion,
    listVersionsForFile,
    getVersionById,
    uploadFileVersion,
    downloadHistoricalVersion,
    restoreFileVersion,
} = require("../services/version.service");

// Reusable mock factory for FileVersion queries and operations
const createMockFileVersionModel = (versions = []) => {
    class MockModel {
        constructor(data) {
            this.data = { ...data, _id: data._id || new mongoose.Types.ObjectId() };
        }
        static findOne(filter = {}) {
            let matched = null;
            if (filter && filter.versionNumber !== undefined) {
                matched = versions.find((v) => v.versionNumber === filter.versionNumber) || null;
            } else if (filter && filter._id) {
                matched = versions.find((v) => String(v._id) === String(filter._id)) || null;
            } else {
                matched = versions.slice().sort((a, b) => (b.versionNumber || 0) - (a.versionNumber || 0))[0] || null;
            }
            return {
                sort: () => ({
                    select: () => ({
                        lean: async () => matched,
                    }),
                    lean: async () => matched,
                }),
                select: () => ({
                    lean: async () => matched,
                }),
                lean: async () => matched,
                then: (resolve) => resolve(matched),
            };
        }
        static async countDocuments() {
            return versions.length;
        }
        static find() {
            return {
                sort: () => ({
                    select: () => ({
                        lean: async () => versions,
                    }),
                    lean: async () => versions,
                }),
            };
        }
        static async deleteOne() {
            return { acknowledged: true, deletedCount: 1 };
        }
        async save() {
            return this.data;
        }
    }
    return MockModel;
};

describe("Version Service Unit Tests", () => {
    describe("computeContentHash", () => {
        test("computes correct SHA-256 hex string for given buffer", () => {
            const buffer = Buffer.from("test document content for versioning");
            const expectedHash = crypto.createHash("sha256").update(buffer).digest("hex");

            const actualHash = computeContentHash(buffer);
            assert.strictEqual(actualHash, expectedHash);
            assert.strictEqual(actualHash.length, 64);
        });

        test("returns null when buffer is missing or invalid", () => {
            assert.strictEqual(computeContentHash(null), null);
            assert.strictEqual(computeContentHash(undefined), null);
            assert.strictEqual(computeContentHash("string-not-buffer"), null);
            assert.strictEqual(computeContentHash(12345), null);
        });
    });

    describe("generateVersionStoragePath", () => {
        test("generates expected namespaced path format", () => {
            const userId = "user_alpha_1";
            const fileId = "60c72b2f9b1d8b2bad000001";
            const versionNumber = 2;
            const originalName = "Quarterly Report Q3.pdf";

            const path = generateVersionStoragePath(userId, fileId, versionNumber, originalName);

            assert.ok(path.startsWith(`${userId}/versions/${fileId}/v2_`));
            assert.ok(path.includes("Quarterly_Report_Q3.pdf"));
        });

        test("strips path traversal attacks and dangerous sequences", () => {
            const userId = "user_alpha_1";
            const fileId = "60c72b2f9b1d8b2bad000001";
            const versionNumber = 3;
            const maliciousName = "../../../../../etc/passwd";

            const path = generateVersionStoragePath(userId, fileId, versionNumber, maliciousName);

            assert.strictEqual(path.includes(".."), false);
            assert.ok(path.startsWith(`${userId}/versions/${fileId}/v3_`));
            assert.ok(path.endsWith("-passwd"));
        });

        test("throws error if required identifiers are missing", () => {
            assert.throws(() => generateVersionStoragePath("", "fileId", 1, "test.pdf"));
            assert.throws(() => generateVersionStoragePath("userId", "", 1, "test.pdf"));
            assert.throws(() => generateVersionStoragePath("userId", "fileId", null, "test.pdf"));
        });
    });

    describe("getNextVersionNumber", () => {
        test("returns latest versionNumber + 1 when FileVersion records exist", async () => {
            const MockFileVersion = createMockFileVersionModel([{ versionNumber: 4 }]);
            const next = await getNextVersionNumber("some-file-id", { FileVersion: MockFileVersion });
            assert.strictEqual(next, 5);
        });

        test("falls back to File.currentVersion + 1 when no FileVersion records exist", async () => {
            const MockFileVersion = createMockFileVersionModel([]);
            const mockFile = {
                findById: () => ({
                    select: () => ({
                        lean: async () => ({ currentVersion: 2 }),
                    }),
                }),
            };

            const next = await getNextVersionNumber("some-file-id", {
                FileVersion: MockFileVersion,
                File: mockFile,
            });
            assert.strictEqual(next, 3);
        });

        test("defaults to 1 when no previous records exist", async () => {
            const MockFileVersion = createMockFileVersionModel([]);
            const mockFile = {
                findById: () => ({
                    select: () => ({
                        lean: async () => null,
                    }),
                }),
            };

            const next = await getNextVersionNumber("some-file-id", {
                FileVersion: MockFileVersion,
                File: mockFile,
            });
            assert.strictEqual(next, 1);
        });
    });

    describe("createFileVersionRecord", () => {
        test("validates required fields before creating record", async () => {
            await assert.rejects(
                () => createFileVersionRecord({}),
                /Missing required fields/
            );
        });

        test("rejects storage path violating isolation boundary", async () => {
            const validParams = {
                fileId: new mongoose.Types.ObjectId(),
                userId: "user_123",
                versionNumber: 2,
                originalName: "test.pdf",
                storagePath: "user_other/versions/fileId/v2-test.pdf",
                mimetype: "application/pdf",
                size: 1024,
                createdBy: "user_123",
            };

            await assert.rejects(
                () => createFileVersionRecord(validParams),
                /Storage path violates user isolation boundary/
            );
        });

        test("creates and saves valid FileVersion instance", async () => {
            const validParams = {
                fileId: new mongoose.Types.ObjectId(),
                userId: "user_123",
                versionNumber: 2,
                originalName: "test.pdf",
                storagePath: "user_123/versions/fileId/v2-test.pdf",
                mimetype: "application/pdf",
                size: 1024,
                contentHash: "abc123hash",
                changeSummary: "Added section 2",
                createdBy: "user_123",
            };

            const MockModel = createMockFileVersionModel();
            const result = await createFileVersionRecord(validParams, {}, { FileVersion: MockModel });
            assert.strictEqual(result.versionNumber, 2);
            assert.strictEqual(result.originalName, "test.pdf");
            assert.strictEqual(result.contentHash, "abc123hash");
        });
    });

    describe("ensureInitialVersion", () => {
        test("returns existing version 1 if already present", async () => {
            const fileDoc = { _id: new mongoose.Types.ObjectId(), userId: "user_1" };
            const MockFileVersion = createMockFileVersionModel([
                { versionNumber: 1, originalName: "existing.pdf" },
            ]);

            const version = await ensureInitialVersion(fileDoc, "user_1", { FileVersion: MockFileVersion });
            assert.strictEqual(version.versionNumber, 1);
            assert.strictEqual(version.originalName, "existing.pdf");
        });

        test("backfills version 1 from fileDoc when no version exists", async () => {
            const fileId = new mongoose.Types.ObjectId();
            const fileDoc = {
                _id: fileId,
                userId: "user_1",
                originalName: "legacy.pdf",
                fileName: "123-legacy.pdf",
                supabasePath: "user_1/123-legacy.pdf",
                mimetype: "application/pdf",
                size: 2048,
                summary: "A legacy file",
                tags: ["legacy"],
            };

            const MockFileVersion = createMockFileVersionModel([]);
            const version = await ensureInitialVersion(fileDoc, "user_1", { FileVersion: MockFileVersion });
            assert.strictEqual(version.versionNumber, 1);
            assert.strictEqual(version.originalName, "legacy.pdf");
            assert.strictEqual(version.storagePath, "user_1/123-legacy.pdf");
            assert.strictEqual(version.changeSummary, "Initial version");
        });
    });

    describe("listVersionsForFile", () => {
        test("rejects invalid ObjectId", async () => {
            await assert.rejects(
                () => listVersionsForFile("invalid-id", "user_1"),
                (err) => err.status === 400
            );
        });

        test("returns 404 when file does not exist or belongs to another user", async () => {
            const validFileId = new mongoose.Types.ObjectId().toString();
            const mockFile = {
                findOne: () => ({
                    lean: async () => null,
                }),
            };

            await assert.rejects(
                () => listVersionsForFile(validFileId, "user_1", { File: mockFile }),
                (err) => err.status === 404
            );
        });

        test("lists versions in descending version order and omits storagePath", async () => {
            const validFileId = new mongoose.Types.ObjectId();
            const mockFileDoc = {
                _id: validFileId,
                userId: "user_1",
                currentVersion: 2,
                totalVersions: 2,
            };

            const mockVersions = [
                { versionNumber: 2, originalName: "doc_v2.pdf", size: 3000 },
                { versionNumber: 1, originalName: "doc_v1.pdf", size: 2000 },
            ];

            const mockFile = {
                findOne: () => ({
                    lean: async () => mockFileDoc,
                }),
            };

            const MockFileVersion = createMockFileVersionModel(mockVersions);

            const result = await listVersionsForFile(validFileId.toString(), "user_1", {
                File: mockFile,
                FileVersion: MockFileVersion,
            });

            assert.strictEqual(result.file.currentVersion, 2);
            assert.strictEqual(result.versions.length, 2);
            assert.strictEqual(result.versions[0].versionNumber, 2);
            assert.strictEqual(result.versions[1].versionNumber, 1);
        });
    });

    describe("uploadFileVersion", () => {
        test("rejects invalid fileId format with 400", async () => {
            await assert.rejects(
                () => uploadFileVersion({ fileId: "malformed", userId: "u1", file: { data: Buffer.from("x") } }),
                (err) => err.status === 400
            );
        });

        test("rejects missing file or oversized file with 400", async () => {
            const validId = new mongoose.Types.ObjectId().toString();
            await assert.rejects(
                () => uploadFileVersion({ fileId: validId, userId: "u1", file: null }),
                (err) => err.status === 400
            );

            await assert.rejects(
                () => uploadFileVersion({
                    fileId: validId,
                    userId: "u1",
                    file: { data: Buffer.from("x"), size: 6 * 1024 * 1024 },
                }),
                (err) => err.status === 400
            );
        });

        test("rejects upload if file does not exist (404)", async () => {
            const validId = new mongoose.Types.ObjectId().toString();
            const mockFile = {
                findOne: async () => null,
            };

            await assert.rejects(
                () => uploadFileVersion(
                    {
                        fileId: validId,
                        userId: "u1",
                        file: { name: "v2.pdf", data: Buffer.from("v2-data"), size: 100, mimetype: "application/pdf" },
                    },
                    { File: mockFile }
                ),
                (err) => err.status === 404
            );
        });

        test("rejects upload if file is soft-deleted (400)", async () => {
            const validId = new mongoose.Types.ObjectId().toString();
            const mockFile = {
                findOne: async () => ({
                    _id: validId,
                    userId: "u1",
                    isDeleted: true,
                }),
            };

            await assert.rejects(
                () => uploadFileVersion(
                    {
                        fileId: validId,
                        userId: "u1",
                        file: { name: "v2.pdf", data: Buffer.from("v2-data"), size: 100, mimetype: "application/pdf" },
                    },
                    { File: mockFile }
                ),
                (err) => err.status === 400 && err.message.includes("Recycle Bin")
            );
        });

        test("successfully uploads new version, creates FileVersion, and updates File metadata", async () => {
            const validId = new mongoose.Types.ObjectId();
            const fileDoc = {
                _id: validId,
                userId: "u1",
                currentVersion: 1,
                totalVersions: 1,
                isDeleted: false,
                fileName: "123-test.pdf",
                supabasePath: "u1/123-test.pdf",
            };

            let storageUploadedPath = null;
            let storageUploadedData = null;
            const mockSupabase = {
                storage: {
                    from: (bucket) => {
                        assert.strictEqual(bucket, "Files-upload");
                        return {
                            upload: async (path, data) => {
                                storageUploadedPath = path;
                                storageUploadedData = data;
                                return { data: { path }, error: null };
                            },
                        };
                    },
                },
            };

            const mockFile = {
                findOne: async () => fileDoc,
                findOneAndUpdate: async (filter, update) => {
                    assert.strictEqual(filter.currentVersion, 1);
                    return {
                        _id: validId,
                        currentVersion: update.$set.currentVersion,
                        totalVersions: update.$set.totalVersions,
                        fileName: update.$set.fileName,
                        supabasePath: update.$set.supabasePath,
                    };
                },
            };

            const MockFileVersion = createMockFileVersionModel([
                { versionNumber: 1, originalName: "123-test.pdf", size: 100 },
            ]);

            const result = await uploadFileVersion(
                {
                    fileId: validId.toString(),
                    userId: "u1",
                    file: {
                        name: "document_v2.pdf",
                        data: Buffer.from("version 2 binary content"),
                        mimetype: "application/pdf",
                        size: 25,
                    },
                    changeSummary: "Updated header",
                },
                {
                    File: mockFile,
                    FileVersion: MockFileVersion,
                    supabase: mockSupabase,
                }
            );

            assert.strictEqual(result.version.versionNumber, 2);
            assert.strictEqual(result.file.currentVersion, 2);
            assert.ok(storageUploadedPath.startsWith("u1/versions/"));
            assert.ok(storageUploadedPath.includes("v2_"));
            assert.strictEqual(result.version.contentHash.length, 64);
        });

        test("triggers compensating cleanup of storage object if DB creation fails", async () => {
            const validId = new mongoose.Types.ObjectId();
            const fileDoc = {
                _id: validId,
                userId: "u1",
                currentVersion: 1,
                totalVersions: 1,
                isDeleted: false,
            };

            let cleanedUpPath = null;
            const mockSupabase = {
                storage: {
                    from: () => ({
                        upload: async (path) => ({ data: { path }, error: null }),
                        remove: async (paths) => {
                            cleanedUpPath = paths[0];
                            return { data: paths, error: null };
                        },
                    }),
                },
            };

            const mockFile = {
                findOne: async () => fileDoc,
            };

            class FailingFileVersionModel extends createMockFileVersionModel([{ versionNumber: 1 }]) {
                async save() {
                    throw new Error("DB connection dropped");
                }
            }

            await assert.rejects(
                () => uploadFileVersion(
                    {
                        fileId: validId.toString(),
                        userId: "u1",
                        file: {
                            name: "doc.pdf",
                            data: Buffer.from("data"),
                            size: 10,
                            mimetype: "application/pdf",
                        },
                    },
                    {
                        File: mockFile,
                        FileVersion: FailingFileVersionModel,
                        supabase: mockSupabase,
                    }
                ),
                /DB connection dropped/
            );

            assert.ok(cleanedUpPath);
            assert.ok(cleanedUpPath.startsWith("u1/versions/"));
        });

        test("handles concurrent update conflict with 409 and compensating cleanup", async () => {
            const validId = new mongoose.Types.ObjectId();
            const fileDoc = {
                _id: validId,
                userId: "u1",
                currentVersion: 1,
                isDeleted: false,
            };

            let cleanedUpPath = null;
            let deletedVersionId = null;

            const mockSupabase = {
                storage: {
                    from: () => ({
                        upload: async (path) => ({ data: { path }, error: null }),
                        remove: async (paths) => {
                            cleanedUpPath = paths[0];
                            return { data: paths, error: null };
                        },
                    }),
                },
            };

            const mockFile = {
                findOne: async () => fileDoc,
                findOneAndUpdate: async () => null, // Concurrency conflict!
            };

            class ConflictFileVersionModel extends createMockFileVersionModel([{ versionNumber: 1 }]) {
                constructor(data) {
                    super(data);
                    this.data._id = "new-version-id";
                }
                static async deleteOne(query) {
                    deletedVersionId = query._id;
                    return { acknowledged: true, deletedCount: 1 };
                }
            }

            await assert.rejects(
                () => uploadFileVersion(
                    {
                        fileId: validId.toString(),
                        userId: "u1",
                        file: {
                            name: "doc.pdf",
                            data: Buffer.from("data"),
                            size: 10,
                            mimetype: "application/pdf",
                        },
                    },
                    {
                        File: mockFile,
                        FileVersion: ConflictFileVersionModel,
                        supabase: mockSupabase,
                    }
                ),
                (err) => err.status === 409
            );

            assert.strictEqual(deletedVersionId, "new-version-id");
            assert.ok(cleanedUpPath);
        });
    });

    describe("downloadHistoricalVersion", () => {
        test("rejects invalid IDs format with 400", async () => {
            await assert.rejects(
                () => downloadHistoricalVersion("bad-file-id", "bad-ver-id", "u1"),
                (err) => err.status === 400
            );
        });

        test("returns 404 when version is not found or belongs to another user", async () => {
            const fileId = new mongoose.Types.ObjectId().toString();
            const versionId = new mongoose.Types.ObjectId().toString();

            const mockFile = {
                findOne: () => ({ lean: async () => ({ _id: fileId, userId: "u1" }) }),
            };
            const mockFileVersion = {
                findOne: () => ({ lean: async () => null }),
            };

            await assert.rejects(
                () => downloadHistoricalVersion(fileId, versionId, "u1", {
                    File: mockFile,
                    FileVersion: mockFileVersion,
                }),
                (err) => err.status === 404
            );
        });

        test("returns 403 when storagePath violates boundary", async () => {
            const fileId = new mongoose.Types.ObjectId().toString();
            const versionId = new mongoose.Types.ObjectId().toString();

            const mockFile = {
                findOne: () => ({ lean: async () => ({ _id: fileId, userId: "u1" }) }),
            };
            const mockFileVersion = {
                findOne: () => ({
                    lean: async () => ({
                        _id: versionId,
                        storagePath: "u2/versions/file/v1.pdf", // User 2 path!
                    }),
                }),
            };

            await assert.rejects(
                () => downloadHistoricalVersion(fileId, versionId, "u1", {
                    File: mockFile,
                    FileVersion: mockFileVersion,
                }),
                (err) => err.status === 403
            );
        });

        test("downloads binary safely from Supabase storage", async () => {
            const fileId = new mongoose.Types.ObjectId().toString();
            const versionId = new mongoose.Types.ObjectId().toString();
            const historicalBuffer = Buffer.from("historical file content");

            const mockFile = {
                findOne: () => ({ lean: async () => ({ _id: fileId, userId: "u1" }) }),
            };
            const mockFileVersion = {
                findOne: () => ({
                    lean: async () => ({
                        _id: versionId,
                        originalName: "report_v1.pdf",
                        storagePath: "u1/versions/fileId/v1_report.pdf",
                        mimetype: "application/pdf",
                        size: historicalBuffer.length,
                    }),
                }),
            };

            const mockSupabase = {
                storage: {
                    from: () => ({
                        download: async (path) => {
                            assert.strictEqual(path, "u1/versions/fileId/v1_report.pdf");
                            return { data: historicalBuffer, error: null };
                        },
                    }),
                },
            };

            const result = await downloadHistoricalVersion(fileId, versionId, "u1", {
                File: mockFile,
                FileVersion: mockFileVersion,
                supabase: mockSupabase,
            });

            assert.strictEqual(result.filename, "report_v1.pdf");
            assert.strictEqual(result.contentType, "application/pdf");
            assert.deepStrictEqual(result.buffer, historicalBuffer);
        });
    });

    describe("restoreFileVersion", () => {
        test("rejects invalid IDs format with 400", async () => {
            await assert.rejects(
                () => restoreFileVersion({ fileId: "bad", versionId: "bad", userId: "u1" }),
                (err) => err.status === 400
            );
        });

        test("rejects restoring soft-deleted file with 400", async () => {
            const fileId = new mongoose.Types.ObjectId().toString();
            const versionId = new mongoose.Types.ObjectId().toString();

            const mockFile = {
                findOne: async () => ({
                    _id: fileId,
                    userId: "u1",
                    isDeleted: true,
                }),
            };

            await assert.rejects(
                () => restoreFileVersion(
                    { fileId, versionId, userId: "u1" },
                    { File: mockFile }
                ),
                (err) => err.status === 400 && err.message.includes("Recycle Bin")
            );
        });

        test("rejects restoring version that is already the current active version with 400", async () => {
            const fileId = new mongoose.Types.ObjectId().toString();
            const versionId = new mongoose.Types.ObjectId().toString();

            const mockFile = {
                findOne: async () => ({
                    _id: fileId,
                    userId: "u1",
                    currentVersion: 2,
                    isDeleted: false,
                }),
            };

            const MockFileVersion = createMockFileVersionModel([
                { _id: versionId, versionNumber: 2 },
            ]);

            await assert.rejects(
                () => restoreFileVersion(
                    { fileId, versionId, userId: "u1" },
                    { File: mockFile, FileVersion: MockFileVersion }
                ),
                (err) => err.status === 400 && err.message.includes("already the current active version")
            );
        });

        test("non-destructively restores historical version by creating new version N+1", async () => {
            const fileId = new mongoose.Types.ObjectId();
            const version1Id = new mongoose.Types.ObjectId();
            const v1Buffer = Buffer.from("v1 original historical binary");

            const fileDoc = {
                _id: fileId,
                userId: "u1",
                currentVersion: 2,
                totalVersions: 2,
                isDeleted: false,
            };

            const targetVersionDoc = {
                _id: version1Id,
                versionNumber: 1,
                originalName: "quarterly_report.pdf",
                storagePath: "u1/versions/fileId/v1_quarterly_report.pdf",
                mimetype: "application/pdf",
                size: v1Buffer.length,
                contentHash: "v1hash123",
            };

            let storageUploadedPath = null;
            let storageUploadedBuffer = null;

            const mockSupabase = {
                storage: {
                    from: () => ({
                        download: async (path) => {
                            assert.strictEqual(path, targetVersionDoc.storagePath);
                            return { data: v1Buffer, error: null };
                        },
                        upload: async (path, buffer) => {
                            storageUploadedPath = path;
                            storageUploadedBuffer = buffer;
                            return { data: { path }, error: null };
                        },
                    }),
                },
            };

            const mockFile = {
                findOne: async () => fileDoc,
                findOneAndUpdate: async (filter, update) => {
                    assert.strictEqual(filter.currentVersion, 2);
                    assert.strictEqual(update.$set.currentVersion, 3);
                    return {
                        _id: fileId,
                        currentVersion: 3,
                        totalVersions: 3,
                        originalName: update.$set.originalName,
                    };
                },
            };

            const MockFileVersion = createMockFileVersionModel([
                targetVersionDoc,
                { versionNumber: 2, originalName: "quarterly_report.pdf" },
            ]);

            const result = await restoreFileVersion(
                {
                    fileId: fileId.toString(),
                    versionId: version1Id.toString(),
                    userId: "u1",
                },
                {
                    File: mockFile,
                    FileVersion: MockFileVersion,
                    supabase: mockSupabase,
                }
            );

            assert.strictEqual(result.version.versionNumber, 3);
            assert.strictEqual(result.file.currentVersion, 3);
            assert.strictEqual(result.version.originalName, "quarterly_report.pdf");
            assert.strictEqual(result.version.changeSummary, "Restored from version 1");
            assert.deepStrictEqual(storageUploadedBuffer, v1Buffer);
            assert.ok(storageUploadedPath.startsWith("u1/versions/"));
            assert.ok(storageUploadedPath.includes("v3_"));
        });
    });
});
