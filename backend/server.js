const dns = require("dns");

dns.setServers(["8.8.8.8", "8.8.4.4"]);

const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { connectDB } = require("./config/db");
const projectRoutes = require("./routes/projectRoutes");
const landParcelRoutes = require("./routes/landParcelRoutes");
const fieldVerificationRoutes = require("./routes/fieldVerificationRoutes");

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api/projects", projectRoutes);
app.use("/api/land-parcels", landParcelRoutes);
app.use("/api/field-verifications", fieldVerificationRoutes);

connectDB();

app.get("/", (req, res) => {
    res.send("BhoomiDrishti Backend is running!");
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});