const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { connectDB } = require("./config/db");
const { isDbReady } = require("./config/db");
const requireDatabase = require("./middleware/requireDatabase");
const projectRoutes = require("./routes/projectRoutes");
const landParcelRoutes = require("./routes/landParcelRoutes");
const fieldVerificationRoutes = require("./routes/fieldVerificationRoutes");
const readinessRoutes = require("./routes/readinessRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const auditLogRoutes = require("./routes/auditLogRoutes");
const userRoutes = require("./routes/userRoutes");
const authRoutes = require("./routes/authRoutes");
const acquisitionProposalRoutes = require("./routes/acquisitionProposalRoutes");
const { requireAuth } = require("./middleware/authentication");

const app = express();
const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  credentials: true,
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    const error = new Error("Origin is not allowed by CORS");
    error.status = 403;
    return callback(error);
  },
}));
app.use(express.json({ limit: "1mb" }));
app.get("/api/health", (req, res) => {
  res.status(isDbReady() ? 200 : 503).json({
    status: isDbReady() ? "ok" : "unavailable",
    database: isDbReady() ? "connected" : "disconnected",
  });
});

app.use("/api", requireDatabase);
app.use("/api/auth", authRoutes);
app.use("/api", requireAuth);
app.use("/api/projects", projectRoutes);
app.use("/api/land-parcels", landParcelRoutes);
app.use("/api/field-verifications", fieldVerificationRoutes);
app.use("/api/readiness", readinessRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/audit-logs", auditLogRoutes);
app.use("/api/users", userRoutes);
app.use("/api/acquisition-proposals", acquisitionProposalRoutes);

app.get("/", (req, res) => {
    res.send("BhoomiDrishti Backend is running!");
});

app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }
  const status = error.status || error.statusCode || 500;
  const message = status >= 500
    ? "An unexpected server error occurred"
    : error.type === "entity.parse.failed"
      ? "Request body contains invalid JSON"
      : error.message;
  return res.status(status).json({ message });
});

const startServer = async () => {
  await connectDB();
  const port = Number(process.env.PORT) || 5000;
  return app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
};

if (require.main === module) {
  startServer().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { app, startServer };