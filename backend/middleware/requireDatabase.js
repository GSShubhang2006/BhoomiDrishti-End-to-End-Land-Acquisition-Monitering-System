const { isDbReady } = require("../config/db");

const requireDatabase = (req, res, next) => {
  if (!isDbReady()) {
    return res.status(503).json({
      message: "Database is unavailable. Retry after the database connection is restored.",
    });
  }
  return next();
};

module.exports = requireDatabase;
