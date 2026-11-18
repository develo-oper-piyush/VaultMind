const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const userModel = require("../models/user.model");
const authMiddleware = require("../middlewares/auth.middleware");
const { loginLimiter } = require("../middlewares/rateLimiter.middleware");

// Constants for limits
const MAX_USERS = 15;

// GET /user/register
router.get("/register", (req, res) => {
    res.json({ message: "Register endpoint active. Please use the frontend application." });
});

// POST /user/register -> Route for registering the user
router.post(
    "/register",
    body("email")
        .trim()
        .isEmail()
        .withMessage("Please enter a valid email address"),
    body("pass")
        .optional()
        .trim()
        .isLength({ min: 5 })
        .withMessage("Password must be at least 5 characters"),
    body("password")
        .optional()
        .trim()
        .isLength({ min: 5 })
        .withMessage("Password must be at least 5 characters"),
    body("username")
        .trim()
        .isLength({ min: 3 })
        .withMessage("Username must be at least 3 characters"),
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                const errorMessage = errors.array()[0].msg;
                return res.status(400).json({
                    success: false,
                    error: errorMessage,
                });
            }

            // Check if user limit is reached
            const userCount = await userModel.countDocuments();
            if (userCount >= MAX_USERS) {
                return res.status(400).json({
                    success: false,
                    error: "Maximum user limit (15) reached. Registration closed.",
                });
            }

            const { email, username, pass, password } = req.body;
            const userPass = pass || password;

            if (!userPass || userPass.length < 5) {
                return res.status(400).json({
                    success: false,
                    error: "Password must be at least 5 characters long",
                });
            }

            // Check if username or email already exists
            const existingUser = await userModel.findOne({
                $or: [{ email }, { username }],
            });

            if (existingUser) {
                return res.status(400).json({
                    success: false,
                    error: "Username or email already exists",
                });
            }

            const hashPassword = await bcrypt.hash(userPass, 10);

            const newUser = await userModel.create({
                email,
                username,
                pass: hashPassword,
            });

            res.json({
                success: true,
                message: "User registered successfully",
                user: {
                    userId: newUser._id,
                    username: newUser.username,
                    email: newUser.email,
                },
            });
        } catch (error) {
            console.error("Registration error:", error);
            if (error.code === 11000) {
                return res.status(400).json({
                    success: false,
                    error: "Username or email already exists",
                });
            }
            return res.status(500).json({
                success: false,
                error: "Registration failed. Please try again.",
            });
        }
    }
);

// GET /user/login
router.get("/login", (req, res) => {
    res.json({ message: "Login endpoint active. Please use the frontend application." });
});

// POST /user/login -> Route for logging in the user
router.post(
    "/login",
    loginLimiter,
    body("username").trim().isLength({ min: 3 }),
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    error: "Invalid username format",
                });
            }

            const { username, pass, password } = req.body;
            const userPass = pass || password;

            if (!userPass) {
                return res.status(400).json({
                    success: false,
                    error: "Password is required",
                });
            }

            // Searching username or email
            const user = await userModel.findOne({
                $or: [{ username: username }, { email: username }],
            });

            if (!user) {
                return res.status(400).json({
                    success: false,
                    error: "Invalid username or password",
                });
            }

            // Compare password
            const isMatch = await bcrypt.compare(userPass, user.pass);

            if (!isMatch) {
                return res.status(400).json({
                    success: false,
                    error: "Invalid username or password",
                });
            }

            // Generate Token
            const token = jwt.sign(
                {
                    userId: user._id,
                    email: user.email,
                    username: user.username,
                },
                process.env.JWT_SECRET
            );

            // Store token in cookie (production requires secure: true and sameSite: 'none' for cross-domain Vercel <-> Render communication)
            const isProduction = process.env.NODE_ENV === "production";
            res.cookie("token", token, {
                httpOnly: true,
                secure: isProduction,
                sameSite: isProduction ? "none" : "lax",
                maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            });

            res.json({
                success: true,
                message: "Logged in successfully",
                token,
                user: {
                    userId: user._id,
                    username: user.username,
                    email: user.email,
                },
            });
        } catch (error) {
            console.error("Login error:", error);
            res.status(500).json({ success: false, error: "Login failed" });
        }
    }
);

// Logout Route
router.all("/logout", (req, res) => {
    const isProduction = process.env.NODE_ENV === "production";
    res.clearCookie("token", {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
    });
    res.json({ success: true, message: "Logged out successfully" });
});

// Profile Route
router.get("/profile", authMiddleware, async (req, res) => {
    try {
        const user = await userModel.findById(req.user.userId).select("-pass");
        if (!user) {
            return res.status(404).json({ success: false, error: "User not found" });
        }

        res.json({
            success: true,
            user: {
                userId: user._id,
                username: user.username,
                email: user.email,
            },
        });
    } catch (error) {
        console.error("Profile error:", error);
        res.status(500).json({ success: false, error: "Failed to fetch profile" });
    }
});

// Change Password Route
router.post(
    "/change-password",
    authMiddleware,
    body("currentPassword")
        .trim()
        .isLength({ min: 5 })
        .withMessage("Current password is required"),
    body("newPassword")
        .trim()
        .isLength({ min: 5 })
        .withMessage("New password must be at least 5 characters"),
    body("confirmPassword")
        .trim()
        .isLength({ min: 5 })
        .withMessage("Please confirm your new password"),
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                const errorMessage = errors.array()[0].msg;
                return res.status(400).json({ success: false, error: errorMessage });
            }

            const user = await userModel.findById(req.user.userId);
            if (!user) {
                return res.status(404).json({ success: false, error: "User not found" });
            }

            const { currentPassword, newPassword, confirmPassword } = req.body;

            if (newPassword !== confirmPassword) {
                return res.status(400).json({
                    success: false,
                    error: "New passwords do not match",
                });
            }

            const isMatch = await bcrypt.compare(currentPassword, user.pass);
            if (!isMatch) {
                return res.status(400).json({
                    success: false,
                    error: "Current password is incorrect",
                });
            }

            if (currentPassword === newPassword) {
                return res.status(400).json({
                    success: false,
                    error: "New password must be different from current password",
                });
            }

            const hashedPassword = await bcrypt.hash(newPassword, 10);
            await userModel.findByIdAndUpdate(req.user.userId, {
                pass: hashedPassword,
            });

            res.json({ success: true, message: "Password updated successfully" });
        } catch (error) {
            console.error("Change password error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to update password. Please try again.",
            });
        }
    }
);

module.exports = router;
