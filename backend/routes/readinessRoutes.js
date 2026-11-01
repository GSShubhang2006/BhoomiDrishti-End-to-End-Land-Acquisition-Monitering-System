const express = require("express");
const { getReadiness } = require("../controllers/readinessController");

const router = express.Router();

router.get("/", getReadiness);

module.exports = router;
