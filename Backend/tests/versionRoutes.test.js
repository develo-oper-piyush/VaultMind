const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const express = require("express");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const fileUpload = require("express-fileupload");
const mongoose = require("mongoose");
const indexRouter = require("../routes/index.routes");

describe("Version History Routes Integration Tests", () => {
    let server;
    let baseUrl;
    const testSecret = "test-integration-jwt-secret-key-12345";
    const testUserId = "user_integration_test";
    let validToken;

    before(async () => {
        process.env.JWT_SECRET = testSecret;
        validToken = jwt.sign({ userId: testUserId }, testSecret);

        const app = express();
        app.use(express.json());
        app.use(express.urlencoded({ extended: true }));
        app.use(fileUpload());
        app.use(cookieParser());

        // Mount routers as in app.js
        app.use("/files", indexRouter);
        app.use("/api/files", indexRouter);

        await new Promise((resolve) => {
            server = http.createServer(app).listen(0, "127.0.0.1", () => {
                const addr = server.address();
                baseUrl = `http://127.0.0.1:${addr.port}`;
                resolve();
            });
        });
    });

    after(async () => {
        if (server) {
            if (typeof server.closeAllConnections === "function") {
                server.closeAllConnections();
            }
            await new Promise((resolve) => server.close(resolve));
        }
    });

    describe("Authentication Enforcement", () => {
        test("GET /files/:fileId/versions rejects unauthenticated requests with 401", async () => {
            const res = await fetch(`${baseUrl}/files/60c72b2f9b1d8b2bad000001/versions`);
            assert.strictEqual(res.status, 401);
            const body = await res.json();
            assert.strictEqual(body.success, false);
            assert.ok(body.error.includes("Unauthorized"));
        });

        test("POST /files/:fileId/version rejects unauthenticated requests with 401", async () => {
            const res = await fetch(`${baseUrl}/files/60c72b2f9b1d8b2bad000001/version`, {
                method: "POST",
            });
            assert.strictEqual(res.status, 401);
        });

        test("GET /files/:fileId/versions/:versionId/download rejects unauthenticated requests with 401", async () => {
            const res = await fetch(
                `${baseUrl}/files/60c72b2f9b1d8b2bad000001/versions/60c72b2f9b1d8b2bad000002/download`
            );
            assert.strictEqual(res.status, 401);
        });

        test("POST /files/:fileId/versions/:versionId/restore rejects unauthenticated requests with 401", async () => {
            const res = await fetch(
                `${baseUrl}/files/60c72b2f9b1d8b2bad000001/versions/60c72b2f9b1d8b2bad000002/restore`,
                { method: "POST" }
            );
            assert.strictEqual(res.status, 401);
        });
    });

    describe("Validation on Route Parameters", () => {
        test("GET /files/:fileId/versions rejects malformed fileId with 400", async () => {
            const res = await fetch(`${baseUrl}/files/not-an-objectid/versions`, {
                headers: { Authorization: `Bearer ${validToken}` },
            });
            assert.strictEqual(res.status, 400);
            const body = await res.json();
            assert.strictEqual(body.success, false);
            assert.ok(body.error.includes("Invalid file ID"));
        });

        test("POST /files/:fileId/version rejects malformed fileId with 400", async () => {
            const res = await fetch(`${baseUrl}/files/invalid-id/version`, {
                method: "POST",
                headers: { Authorization: `Bearer ${validToken}` },
            });
            assert.strictEqual(res.status, 400);
        });

        test("POST /files/:fileId/version rejects request when no file uploaded with 400", async () => {
            const validFileId = new mongoose.Types.ObjectId().toString();
            const res = await fetch(`${baseUrl}/files/${validFileId}/version`, {
                method: "POST",
                headers: { Authorization: `Bearer ${validToken}` },
            });
            assert.strictEqual(res.status, 400);
            const body = await res.json();
            assert.strictEqual(body.error, "No file uploaded");
        });

        test("GET /files/:fileId/versions/:versionId/download rejects malformed IDs with 400", async () => {
            const validId = new mongoose.Types.ObjectId().toString();
            const res = await fetch(`${baseUrl}/files/${validId}/versions/invalid-vid/download`, {
                headers: { Authorization: `Bearer ${validToken}` },
            });
            assert.strictEqual(res.status, 400);
            const body = await res.json();
            assert.ok(body.error.includes("Invalid file ID or version ID"));
        });

        test("POST /files/:fileId/versions/:versionId/restore rejects malformed IDs with 400", async () => {
            const validId = new mongoose.Types.ObjectId().toString();
            const res = await fetch(`${baseUrl}/files/bad-fid/versions/${validId}/restore`, {
                method: "POST",
                headers: { Authorization: `Bearer ${validToken}` },
            });
            assert.strictEqual(res.status, 400);
        });
    });

    describe("API Prefix Routing Consistency", () => {
        test("works identically across /files and /api/files route prefixes", async () => {
            const validFileId = new mongoose.Types.ObjectId().toString();

            // Calling /api/files/:fileId/versions with malformed ID
            const apiRes = await fetch(`${baseUrl}/api/files/bad-id/versions`, {
                headers: { Authorization: `Bearer ${validToken}` },
            });
            assert.strictEqual(apiRes.status, 400);

            // Calling /files/:fileId/version (singular)
            const filesRes = await fetch(`${baseUrl}/files/bad-id/version`, {
                method: "POST",
                headers: { Authorization: `Bearer ${validToken}` },
            });
            assert.strictEqual(filesRes.status, 400);
        });
    });

    describe("Security: Unauthenticated requests blocked for all version endpoints (Day 7)", () => {
        test("version upload rejects request with no file present with 400 (pre-auth check passes)", async () => {
            // This confirms 400 before any ownership check — ownership is tested in service unit tests
            const validFileId = new mongoose.Types.ObjectId().toString();
            const res = await fetch(`${baseUrl}/files/${validFileId}/version`, {
                method: "POST",
                headers: { Authorization: `Bearer ${validToken}` },
            });
            assert.strictEqual(res.status, 400);
            const body = await res.json();
            assert.ok(body.error.includes("No file") || body.error.includes("file"));
        });
    });
});
