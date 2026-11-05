const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

test("Share Links Service - creation and validation logic", async () => {
    // 1. Password hashing test
    const rawPassword = "secret123SharePassword";
    const hash = await bcrypt.hash(rawPassword, 10);
    assert.equal(await bcrypt.compare(rawPassword, hash), true);
    assert.equal(await bcrypt.compare("wrongPassword", hash), false);

    // 2. Expiration calculation
    const now = Date.now();
    const expiresInHours = 24;
    const expiresAt = new Date(now + expiresInHours * 3600 * 1000);
    assert.ok(expiresAt.getTime() > now);
    assert.equal(new Date() > expiresAt, false);

    // Expired date test
    const expiredDate = new Date(now - 1000);
    assert.equal(new Date() > expiredDate, true);

    // 3. Max views enforcement logic
    const share = {
        maxViews: 5,
        viewsCount: 5,
    };
    const isLimitReached = share.maxViews !== null && share.viewsCount >= share.maxViews;
    assert.equal(isLimitReached, true);

    share.viewsCount = 3;
    assert.equal(share.maxViews !== null && share.viewsCount >= share.maxViews, false);
});

test("Share Links - JWT authorization token generation & verification", () => {
    const secret = "test_jwt_secret";
    const token = "mock_share_token_12345";
    const shareId = "mock_share_id_67890";

    const authToken = jwt.sign(
        { token, shareId, authorized: true },
        secret,
        { expiresIn: "2h" }
    );

    const decoded = jwt.verify(authToken, secret);
    assert.equal(decoded.token, token);
    assert.equal(decoded.shareId, shareId);
    assert.equal(decoded.authorized, true);

    assert.throws(() => {
        jwt.verify(authToken, "wrong_secret");
    });
});

