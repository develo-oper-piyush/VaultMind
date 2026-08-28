// Load environment variables FIRST before any other imports
const dotenv = require("dotenv");
dotenv.config();

const express = require("express");
const userRouter = require("./routes/user.routes");
const indexRouter = require("./routes/index.routes");
const cookieParser = require("cookie-parser");
const fileUpload = require("express-fileupload");
const connectToDB = require("./config/db");
connectToDB();

const app = express();

// CORS Middleware to allow requests from Frontend
app.use((req, res, next) => {
    const allowedOrigin = process.env.FRONTEND_URL || "http://localhost:3001";
    const origin = req.headers.origin;
    if (origin) {
        res.setHeader("Access-Control-Allow-Origin", origin);
    } else {
        res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    }
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS"
    );
    res.setHeader(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept, Authorization"
    );
    if (req.method === "OPTIONS") {
        return res.sendStatus(200);
    }
    next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());
app.use(express.static("public"));
app.use(cookieParser());

// Routers with flexible base paths
app.use("/files", indexRouter);
app.use("/api/files", indexRouter);
app.use("/user", userRouter);
app.use("/api/user", userRouter);
app.use("/", indexRouter);

// 404 Handler - Route not found
app.use((req, res, next) => {
    res.status(404).json({
        success: false,
        error: "Route not found",
    });
});

// Global Error Handler - Catches all errors
app.use((err, req, res, next) => {
    console.error("=== ERROR ===");
    console.error("Message:", err.message);
    console.error("Stack:", err.stack);
    console.error("=============");

    res.status(err.status || 500).json({
        success: false,
        error: err.message || "An unexpected error occurred. Please try again later.",
    });
});

app.listen(process.env.PORT || 3000, () => {
    console.log("Server is running");
});
