// Server entry point - imports routes which creates its own Express app
// The routes.ts file exports a function that sets up the Express app

import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware - must be set up BEFORE importing routes
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root
app.get('/', (req, res) => {
  res.json({ message: 'AI Run Coach API', version: '2.0' });
});

// Import route modules (they use app from their closure)
// This pattern expects routes to use app.METHOD directly
// We need to make app available globally for the route modules

// Make app available globally for route modules
(global as any).expressApp = app;

// Import all route files - they register themselves
import './routes/auth.js';
import './routes/coaching.js';
import './routes/fitness.js';
import './routes/goals.js';
import './routes/friends.js';
import './routes/groupRuns.js';
import './routes/runs.js';
import './routes/profile.js';
import './routes/garmin.js';
import './routes/index.js';

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});