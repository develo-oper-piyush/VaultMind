const { rateLimit } = require("express-rate-limit");

/**
 * Creates an Express rate-limiter middleware for authentication endpoints.
 * Protects against brute-force attacks and credential stuffing.
 *
 * @param {Object} [customOptions] - Optional overrides for rate-limit configuration
 * @returns {Function} Express rate limit middleware
 */
const createLoginLimiter = (customOptions = {}) => {
    const windowMs =
        customOptions.windowMs !== undefined
            ? customOptions.windowMs
            : process.env.LOGIN_RATE_LIMIT_WINDOW_MS
            ? parseInt(process.env.LOGIN_RATE_LIMIT_WINDOW_MS, 10)
            : 15 * 60 * 1000; // 15 minutes default

    const max =
        customOptions.limit !== undefined
            ? customOptions.limit
            : customOptions.max !== undefined
            ? customOptions.max
            : process.env.LOGIN_RATE_LIMIT_MAX
            ? parseInt(process.env.LOGIN_RATE_LIMIT_MAX, 10)
            : 5; // 5 attempts per window default

    const skipSuccessfulRequests =
        customOptions.skipSuccessfulRequests !== undefined
            ? customOptions.skipSuccessfulRequests
            : process.env.LOGIN_RATE_LIMIT_SKIP_SUCCESSFUL === "true";

    return rateLimit({
        windowMs,
        limit: max,
        standardHeaders: true, // draft-6 / draft-7 RateLimit-* headers
        legacyHeaders: true, // X-RateLimit-* headers
        skipSuccessfulRequests,
        statusCode: 429,
        message: {
            success: false,
            error: "Too many login attempts. Please try again after 15 minutes.",
        },
        handler: (req, res, next, options) => {
            const retryAfterSec =
                res.getHeader("Retry-After") || Math.ceil(windowMs / 1000);
            res.status(options.statusCode || 429).json({
                success: false,
                error:
                    (options.message && options.message.error) ||
                    "Too many login attempts. Please try again after 15 minutes.",
                retryAfter: Number(retryAfterSec),
            });
        },
        ...customOptions,
    });
};

const loginLimiter = createLoginLimiter();

module.exports = loginLimiter;
module.exports.loginLimiter = loginLimiter;
module.exports.createLoginLimiter = createLoginLimiter;

