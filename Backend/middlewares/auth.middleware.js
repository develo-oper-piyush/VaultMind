const jwt = require("jsonwebtoken");

const authMiddleware = async (req, res, next) => {
    try {
        const token =
            req.cookies.token ||
            req.query.token ||
            (req.headers.authorization &&
                req.headers.authorization.split(" ")[1]);

        if (!token) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized. Please log in.",
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        console.error("Auth error:", error.message);
        return res.status(401).json({
            success: false,
            error: "Invalid or expired token. Please log in again.",
        });
    }
};

module.exports = authMiddleware;
