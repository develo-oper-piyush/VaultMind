const { test, describe } = require("node:test");
const assert = require("node:assert");
const mongoose = require("mongoose");
const File = require("../models/file.model");
const FileVersion = require("../models/fileVersion.model");

describe("Mongoose Models Validation & Schemas", () => {
    describe("File Model Schema", () => {
        test("has expected default values for versioning and recycle bin fields", () => {
            const file = new File({
                userId: "user_test_1",
                fileName: "12345-sample.pdf",
                originalName: "sample.pdf",
                supabasePath: "user_test_1/12345-sample.pdf",
                mimetype: "application/pdf",
                size: 1024,
            });

            assert.strictEqual(file.currentVersion, 1);
            assert.strictEqual(file.totalVersions, 1);
            assert.strictEqual(file.isDeleted, false);
            assert.strictEqual(file.deletedAt, null);
            assert.strictEqual(file.deletionExpiresAt, null);
            assert.strictEqual(file.deletedBy, null);
            assert.strictEqual(file.originalFolder, "/");
        });

        test("validates required fields on File model", async () => {
            const emptyFile = new File({});
            const error = emptyFile.validateSync();
            assert.ok(error);
            assert.ok(error.errors.userId);
            assert.ok(error.errors.fileName);
            assert.ok(error.errors.originalName);
            assert.ok(error.errors.supabasePath);
            assert.ok(error.errors.mimetype);
            assert.ok(error.errors.size);
        });

        test("defines compound indexes for user and recycle bin queries", () => {
            const indexes = File.schema.indexes();
            const indexKeyList = indexes.map((idx) => idx[0]);

            // Check { userId: 1, createdAt: -1 }
            const hasUserCreatedIndex = indexKeyList.some(
                (k) => k.userId === 1 && k.createdAt === -1 && Object.keys(k).length === 2
            );
            assert.strictEqual(hasUserCreatedIndex, true, "Missing { userId: 1, createdAt: -1 } index");

            // Check { userId: 1, isDeleted: 1, createdAt: -1 }
            const hasActiveTrashIndex = indexKeyList.some(
                (k) => k.userId === 1 && k.isDeleted === 1 && k.createdAt === -1
            );
            assert.strictEqual(hasActiveTrashIndex, true, "Missing { userId: 1, isDeleted: 1, createdAt: -1 } index");

            // Check { userId: 1, isDeleted: 1, deletionExpiresAt: 1 }
            const hasExpirationIndex = indexKeyList.some(
                (k) => k.userId === 1 && k.isDeleted === 1 && k.deletionExpiresAt === 1
            );
            assert.strictEqual(hasExpirationIndex, true, "Missing { userId: 1, isDeleted: 1, deletionExpiresAt: 1 } index");
        });

        test("provides active and deleted query helpers and static methods", () => {
            assert.strictEqual(typeof File.schema.query.active, "function");
            assert.strictEqual(typeof File.schema.query.deleted, "function");
            assert.strictEqual(typeof File.findActive, "function");
            assert.strictEqual(typeof File.findDeleted, "function");

            const activeQuery = File.find({ userId: "u1" }).active();
            assert.deepStrictEqual(activeQuery.getQuery(), {
                userId: "u1",
                isDeleted: { $ne: true },
            });

            const deletedQuery = File.find({ userId: "u1" }).deleted();
            assert.deepStrictEqual(deletedQuery.getQuery(), {
                userId: "u1",
                isDeleted: true,
            });
        });
    });

    describe("FileVersion Model Schema", () => {
        test("requires all necessary version metadata fields", () => {
            const emptyVersion = new FileVersion({});
            const error = emptyVersion.validateSync();
            assert.ok(error);
            assert.ok(error.errors.fileId, "fileId is required");
            assert.ok(error.errors.userId, "userId is required");
            assert.ok(error.errors.versionNumber, "versionNumber is required");
            assert.ok(error.errors.originalName, "originalName is required");
            assert.ok(error.errors.storagePath, "storagePath is required");
            assert.ok(error.errors.mimetype, "mimetype is required");
            assert.ok(error.errors.size, "size is required");
            assert.ok(error.errors.createdBy, "createdBy is required");
        });

        test("accepts valid version instance with defaults", () => {
            const validFileId = new mongoose.Types.ObjectId();
            const version = new FileVersion({
                fileId: validFileId,
                userId: "user_test_1",
                versionNumber: 2,
                originalName: "project_plan.docx",
                storagePath: "user_test_1/versions/fileId/v2_123-project_plan.docx",
                mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                size: 20480,
                createdBy: "user_test_1",
            });

            const error = version.validateSync();
            assert.strictEqual(error, undefined);
            assert.strictEqual(version.changeSummary, "Updated file content");
            assert.deepStrictEqual(version.tagsSnapshot, []);
            assert.strictEqual(version.summarySnapshot, null);
            assert.strictEqual(version.contentHash, null);
            assert.ok(version.createdAt instanceof Date);
        });

        test("enforces minimum constraint on versionNumber and size", () => {
            const invalidVersion = new FileVersion({
                fileId: new mongoose.Types.ObjectId(),
                userId: "user_test_1",
                versionNumber: 0, // Invalid: min is 1
                originalName: "plan.docx",
                storagePath: "user_test_1/versions/fileId/v0-plan.docx",
                mimetype: "application/pdf",
                size: -5, // Invalid: min is 0
                createdBy: "user_test_1",
            });

            const error = invalidVersion.validateSync();
            assert.ok(error);
            assert.ok(error.errors.versionNumber);
            assert.ok(error.errors.size);
        });

        test("enforces compound unique index on { fileId: 1, versionNumber: 1 }", () => {
            const indexes = FileVersion.schema.indexes();
            const uniqueCompound = indexes.find(
                (idx) => idx[0].fileId === 1 && idx[0].versionNumber === 1 && idx[1]?.unique === true
            );
            assert.ok(uniqueCompound, "Missing compound unique index { fileId: 1, versionNumber: 1 }");
        });

        test("enforces chronological indexes for file versions and user queries", () => {
            const indexes = FileVersion.schema.indexes();
            const hasFileOrderIndex = indexes.some(
                (idx) => idx[0].fileId === 1 && idx[0].createdAt === -1
            );
            const hasUserOrderIndex = indexes.some(
                (idx) => idx[0].userId === 1 && idx[0].createdAt === -1
            );

            assert.strictEqual(hasFileOrderIndex, true, "Missing { fileId: 1, createdAt: -1 } index");
            assert.strictEqual(hasUserOrderIndex, true, "Missing { userId: 1, createdAt: -1 } index");
        });
    });
});
