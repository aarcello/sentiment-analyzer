import express from 'express';
import cors from 'cors';
import path from 'path';
import apiRouter from './api';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../../public')));

// API routes
app.use('/api', apiRouter);

// Serve index.html for all other routes (SPA support)
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/index.html'));
});

export function startServer(port: number = PORT as number) {
  return app.listen(port, () => {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   Sentiment Analyzer Web Interface                         ║
║                                                            ║
║   Server running at: http://localhost:${port}               ║
║                                                            ║
║   Open this URL in your browser to get started!            ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
    `);
  });
}

// Start server if run directly
if (require.main === module) {
  startServer();
}

export default app;
