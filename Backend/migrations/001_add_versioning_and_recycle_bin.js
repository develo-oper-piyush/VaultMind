/**
 * Migration 001: Add File Versioning and Recycle Bin Fields & Indexes
 * 
 * Target: MongoDB / Mongoose collections 'files' and 'fileversions'
 * Safe, idempotent migration to:
 * 1. Initialize and sync compound indexes for File and FileVersion models.
 * 2. Backfill existing legacy file documents with default versioning and soft-delete fields.
 */

const path = require("path");
const dotenv = require("dotenv");
dotenv.config({
    path: [path.join(__dirname, "..", ".env"), path.join(__dirname, "..", "env")],
});

const mongoose = require("mongoose");
const File = require("../models/file.model");
const FileVersion = require("../models/fileVersion.model");

const runMigration = async () => {
    console.log("=== STARTING MIGRATION 001: Versioning and Recycle Bin ===");

    // Connect if not already connected
    if (mongoose.connection.readyState !== 1) {
        const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
        if (!mongoUri) {
            throw new Error("MongoDB URI is required to run migration");
        }
        await mongoose.connect(mongoUri);
        console.log("Connected to MongoDB for migration");
    }

    // 1. Sync indexes
    console.log("Syncing indexes for File model...");
    await File.syncIndexes();
    console.log("File indexes synced successfully.");

    console.log("Syncing indexes for FileVersion model...");
    await FileVersion.syncIndexes();
    console.log("FileVersion indexes synced successfully.");

    // 2. Backfill existing legacy File documents
    console.log("Backfilling legacy documents in 'files' collection...");
    const result = await File.updateMany(
        {
            $or: [
                { isDeleted: { $exists: false } },
                { currentVersion: { $exists: false } },
                { totalVersions: { $exists: false } },
            ],
        },
        {
            $set: {
                isDeleted: false,
                deletedAt: null,
                deletionExpiresAt: null,
                deletedBy: null,
                originalFolder: "/",
                currentVersion: 1,
                totalVersions: 1,
            },
        }
    );

    console.log(`Backfill complete. Matched: ${result.matchedCount || 0}, Modified: ${result.modifiedCount || 0}`);
    console.log("=== MIGRATION 001 COMPLETED SUCCESSFULLY ===");
    return {
        success: true,
        matched: result.matchedCount || 0,
        modified: result.modifiedCount || 0,
    };
};

// Allow direct execution from CLI
if (require.main === module) {
    runMigration()
        .then(() => {
            console.log("Migration executed successfully. Exiting...");
            process.exit(0);
        })
        .catch((err) => {
            console.error("Migration failed:", err);
            process.exit(1);
        });
}

module.exports = {
    runMigration,
};
