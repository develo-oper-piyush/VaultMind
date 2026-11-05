const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const {
    loginLimiter,
    createLoginLimiter,
} = require("../middlewares/rateLimiter.middleware");

test("loginRateLimiter - exports default and named middleware", () => {
    assert.equal(typeof loginLimiter, "function");
    assert.equal(typeof createLoginLimiter, "function");
});

test("loginRateLimiter - allows requests under the rate limit threshold", async () => {
    const app = express();
    app.use(express.json());

    const testLimiter = createLoginLimiter({
        windowMs: 60 * 1000,
        limit: 3,
    });

    app.post("/test-login", testLimiter, (req, res) => {
        res.status(200).json({ success: true });
    });

    const server = app.listen(0);
    const port = server.address().port;

    try {
        for (let i = 1; i <= 3; i++) {
            const res = await fetch(`http://127.0.0.1:${port}/test-login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: "testuser", password: "wrong" }),
            });

            assert.equal(res.status, 200, `Request #${i} should pass under limit`);
            const data = await res.json();
            assert.equal(data.success, true);
        }
    } finally {
        server.close();
    }
});

test("loginRateLimiter - blocks requests exceeding rate limit with HTTP 429 and error message", async () => {
    const app = express();
    app.use(express.json());

    const maxAttempts = 3;
    const testLimiter = createLoginLimiter({
        windowMs: 15 * 60 * 1000,
        limit: maxAttempts,
    });

    app.post("/test-login", testLimiter, (req, res) => {
        res.status(400).json({ success: false, error: "Invalid username or password" });
    });

    const server = app.listen(0);
    const port = server.address().port;

    try {
        // Send maxAttempts requests that fail credentials
        for (let i = 1; i <= maxAttempts; i++) {
            const res = await fetch(`http://127.0.0.1:${port}/test-login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: "victim", password: "wrong" }),
            });
            assert.equal(res.status, 400);
        }

        // The (maxAttempts + 1)-th request must be rate limited
        const blockedRes = await fetch(`http://127.0.0.1:${port}/test-login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: "victim", password: "wrong" }),
        });

        assert.equal(blockedRes.status, 429, "Expected HTTP 429 Too Many Requests");

        const data = await blockedRes.json();
        assert.equal(data.success, false);
        assert.match(data.error, /too many login attempts/i);
        assert.ok(data.retryAfter !== undefined);

        // Check RateLimit headers
        assert.ok(
            blockedRes.headers.get("ratelimit-limit") ||
            blockedRes.headers.get("x-ratelimit-limit"),
            "Expected RateLimit headers"
        );
        assert.ok(
            blockedRes.headers.get("retry-after"),
            "Expected Retry-After header"
        );
    } finally {
        server.close();
    }
});

test("loginRateLimiter - integration with user.routes /login endpoint", async () => {
    // Verify user.routes imports and mounts loginLimiter
    const userRouter = require("../routes/user.routes");
    const app = express();
    app.use(express.json());
    app.use("/user", userRouter);

    const server = app.listen(0);
    const port = server.address().port;

    try {
        // Send request that fails express-validator (username < 3 chars)
        // This validates that the rate limiter ran and attached headers without waiting for DB
        const res = await fetch(`http://127.0.0.1:${port}/user/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: "ab", password: "secretpassword" }),
        });

        assert.equal(res.status, 400);
        const data = await res.json();
        assert.equal(data.error, "Invalid username format");

        // Verify rate limiting headers attached by loginLimiter middleware
        assert.ok(
            res.headers.get("ratelimit-limit") ||
            res.headers.get("x-ratelimit-limit") ||
            res.headers.get("ratelimit"),
            "Expected rate limiting headers on /user/login"
        );
    } finally {
        server.close();
    }
});
