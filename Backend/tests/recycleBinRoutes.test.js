const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const express = require("express");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const fileUpload = require("express-fileupload");
const mongoose = require("mongoose");
const indexRouter = require("../routes/index.routes");

describe("Recycle Bin Routes Integration Tests", () => {
    let server;
    let baseUrl;
    const testSecret = "test-recycle-bin-jwt-secret-key-12345";
    const testUserId = "user_rb_integration_test";
    let validToken;
    let originalFind;
    let originalDeleteMany;

    before(async () => {
        process.env.JWT_SECRET = testSecret;
        validToken = jwt.sign({ userId: testUserId }, testSecret);

        // Stub File query methods to return in-memory responses for route integration testing
        const File = require("../models/file.model");
        originalFind = File.find;
        originalDeleteMany = File.deleteMany;

        File.find = function () {
            const queryObj = {
                sort: () => ({
                    lean: async () => [],
                }),
                select: () => ({
                    lean: async () => [],
                }),
                lean: async () => [],
                then: (resolve) => resolve([]),
            };
            return queryObj;
        };

        File.deleteMany = async () => ({ acknowledged: true, deletedCount: 0 });

        const app = express();
        app.use(express.json());
        app.use(express.urlencoded({ extended: true }));
        app.use(fileUpload());
        app.use(cookieParser());

        // Mount routers as in app.js
        app.use("/files", indexRouter);
        app.use("/api/files", indexRouter);
        app.use("/", indexRouter);

        await new Promise((resolve) => {
            server = http.createServer(app).listen(0, "127.0.0.1", () => {
                const addr = server.address();
                baseUrl = `http://127.0.0.1:${addr.port}`;
                resolve();
            });
        });
    });

    after(async () => {
        const File = require("../models/file.model");
        if (originalFind) File.find = originalFind;
        if (originalDeleteMany) File.deleteMany = originalDeleteMany;

        if (server) {
            if (typeof server.closeAllConnections === "function") {
                server.closeAllConnections();
            }
            await new Promise((resolve) => server.close(resolve));
        }
    });

    describe("Authentication Enforcement", () => {
        test("GET /files/recycle-bin rejects unauthenticated requests with 401", async () => {
            const res = await fetch(`${baseUrl}/files/recycle-bin`);
            assert.strictEqual(res.status, 401);
            const body = await res.json();
            assert.strictEqual(body.success, false);
            assert.ok(body.error.includes("Unauthorized"));
        });

        test("POST /files/recycle-bin/:fileId/restore rejects unauthenticated requests with 401", async () => {
            const validId = new mongoose.Types.ObjectId().toString();
            const res = await fetch(`${baseUrl}/files/recycle-bin/${validId}/restore`, {
                method: "POST",
            });
            assert.strictEqual(res.status, 401);
        });

        test("DELETE /files/recycle-bin/:fileId rejects unauthenticated requests with 401", async () => {
            const validId = new mongoose.Types.ObjectId().toString();
            const res = await fetch(`${baseUrl}/files/recycle-bin/${validId}`, {
                method: "DELETE",
            });
            assert.strictEqual(res.status, 401);
        });

        test("DELETE /files/recycle-bin/empty rejects unauthenticated requests with 401", async () => {
            const res = await fetch(`${baseUrl}/files/recycle-bin/empty`, {
                method: "DELETE",
            });
            assert.strictEqual(res.status, 401);
        });

        test("POST /files/:fileId/trash rejects unauthenticated requests with 401", async () => {
            const validId = new mongoose.Types.ObjectId().toString();
            const res = await fetch(`${baseUrl}/files/${validId}/trash`, {
                method: "POST",
            });
            assert.strictEqual(res.status, 401);
        });

        test("POST /files/delete-file rejects unauthenticated requests with 401", async () => {
            const res = await fetch(`${baseUrl}/files/delete-file`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fileName: "test.pdf" }),
            });
            assert.strictEqual(res.status, 401);
        });
    });

    describe("Validation on Route Parameters", () => {
        test("POST /files/recycle-bin/:fileId/restore rejects malformed fileId with 400", async () => {
            const res = await fetch(`${baseUrl}/files/recycle-bin/not-an-objectid/restore`, {
                method: "POST",
                headers: { Authorization: `Bearer ${validToken}` },
            });
            assert.strictEqual(res.status, 400);
            const body = await res.json();
            assert.strictEqual(body.success, false);
            assert.ok(body.error.includes("Invalid file ID format"));
        });

        test("DELETE /files/recycle-bin/:fileId rejects malformed fileId with 400", async () => {
            const res = await fetch(`${baseUrl}/files/recycle-bin/not-an-objectid`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${validToken}` },
            });
            assert.strictEqual(res.status, 400);
            const body = await res.json();
            assert.strictEqual(body.success, false);
            assert.ok(body.error.includes("Invalid file ID format"));
        });

        test("POST /files/:fileId/trash rejects malformed fileId with 400", async () => {
            const res = await fetch(`${baseUrl}/files/not-an-objectid/trash`, {
                method: "POST",
                headers: { Authorization: `Bearer ${validToken}` },
            });
            assert.strictEqual(res.status, 400);
            const body = await res.json();
            assert.strictEqual(body.success, false);
            assert.ok(body.error.includes("Invalid file ID format"));
        });

        test("POST /files/delete-file rejects request when neither fileName nor fileId is provided with 400", async () => {
            const res = await fetch(`${baseUrl}/files/delete-file`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${validToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({}),
            });
            assert.strictEqual(res.status, 400);
            const body = await res.json();
            assert.ok(body.error.includes("No file identifier provided"));
        });
    });

    describe("Route Order Integrity (/empty vs :fileId)", () => {
        test("DELETE /files/recycle-bin/empty reaches empty handler and is not treated as :fileId='empty'", async () => {
            const res = await fetch(`${baseUrl}/files/recycle-bin/empty`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${validToken}` },
            });
            // If it had been captured as :fileId="empty", it would have returned 400 "Invalid file ID format".
            // Since it reaches emptyRecycleBin, it returns 200 (or empty bin response).
            assert.notStrictEqual(res.status, 400);
            assert.strictEqual(res.status, 200);
            const body = await res.json();
            assert.strictEqual(body.success, true);
        });

        test("POST /files/recycle-bin/empty also reaches empty handler", async () => {
            const res = await fetch(`${baseUrl}/files/recycle-bin/empty`, {
                method: "POST",
                headers: { Authorization: `Bearer ${validToken}` },
            });
            assert.strictEqual(res.status, 200);
            const body = await res.json();
            assert.strictEqual(body.success, true);
        });
    });

    describe("API Prefix Routing Consistency", () => {
        test("GET works identically across /files/recycle-bin and /api/files/recycle-bin", async () => {
            const res1 = await fetch(`${baseUrl}/files/recycle-bin`, {
                headers: { Authorization: `Bearer ${validToken}` },
            });
            assert.strictEqual(res1.status, 200);
            const body1 = await res1.json();
            assert.strictEqual(body1.success, true);

            const res2 = await fetch(`${baseUrl}/api/files/recycle-bin`, {
                headers: { Authorization: `Bearer ${validToken}` },
            });
            assert.strictEqual(res2.status, 200);
            const body2 = await res2.json();
            assert.strictEqual(body2.success, true);
        });

        test("POST restore rejects malformed IDs identically across /files and /api/files", async () => {
            const res1 = await fetch(`${baseUrl}/files/recycle-bin/bad-id/restore`, {
                method: "POST",
                headers: { Authorization: `Bearer ${validToken}` },
            });
            assert.strictEqual(res1.status, 400);

            const res2 = await fetch(`${baseUrl}/api/files/recycle-bin/bad-id/restore`, {
                method: "POST",
                headers: { Authorization: `Bearer ${validToken}` },
            });
            assert.strictEqual(res2.status, 400);
        });
    });

    describe("Security: Input validation confirms no ID leak (Day 7)", () => {
        test("all recycle bin write endpoints reject malformed IDs before reaching DB", async () => {
            // All these reject at the validation layer before any ownership check or DB call
            const malformed = "not-a-valid-id";

            const restoreRes = await fetch(`${baseUrl}/files/recycle-bin/${malformed}/restore`, {
                method: "POST",
                headers: { Authorization: `Bearer ${validToken}` },
            });
            assert.strictEqual(restoreRes.status, 400);

            const deleteRes = await fetch(`${baseUrl}/files/recycle-bin/${malformed}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${validToken}` },
            });
            assert.strictEqual(deleteRes.status, 400);

            const trashRes = await fetch(`${baseUrl}/files/${malformed}/trash`, {
                method: "POST",
                headers: { Authorization: `Bearer ${validToken}` },
            });
            assert.strictEqual(trashRes.status, 400);
        });
    });
});
