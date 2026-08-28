const mongoose = require("mongoose");
const dns = require("dns");

// Force Node.js c-ares DNS resolver to use Google and Cloudflare public DNS for SRV lookup
try {
    dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch (e) {
    console.warn("Could not override DNS servers:", e.message);
}

if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder("ipv4first");
}

const connectToDB = () => {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!mongoUri) {
        console.error("MongoDB URI is missing in .env file!");
        return;
    }

    mongoose
        .connect(mongoUri)
        .then(() => {
            console.log("Connected to DB successfully");
        })
        .catch((err) => {
            console.error("=== Database Connection Error ===");
            console.error(err.message);
            console.error("Please check your internet connection, DNS, or MongoDB Atlas IP Access List.");
            console.error("=================================");
        });
};

module.exports = connectToDB;
