const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const callRoutes = require('./routes/callRoutes');
const { initDb } = require('./db/init');

const app = express();

// Middleware
app.use(helmet());

const corsOrigin = process.env.CORS_ORIGIN || '*';
app.use(
  cors({
    origin: corsOrigin === '*' ? '*' : corsOrigin,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Health
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
  });
});

// Routes
app.use('/', callRoutes);

// Start server after DB init
const PORT = process.env.PORT || 3000;

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database', err);
    process.exit(1);
  });

module.exports = app;


