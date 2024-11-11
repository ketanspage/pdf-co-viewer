const express = require('express');
const WebSocket = require('ws');
const multer = require('multer');
const path = require('path');
const url = require('url');

const app = express();
const PORT = 3000;

// Set up storage for uploaded files
const storage = multer.diskStorage({
  destination: 'public/uploads',
  filename: (req, file, cb) => {
    cb(null, 'uploaded_pdf.pdf'); // Always overwrite with the same filename
  }
});
const upload = multer({ storage });

// Serve static files
app.use(express.static('public'));

// PDF upload endpoint
app.post('/upload', upload.single('pdf'), (req, res) => {
  res.json({ filePath: `/uploads/${req.file.filename}` });
});

// WebSocket server setup
const server = app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
const wss = new WebSocket.Server({ server });

let currentPage = 1;
let currentFilePath = `/uploads/uploaded_pdf.pdf`; // Default file path

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  // Extract role from query parameters
  const queryParams = url.parse(req.url, true).query;
  const role = queryParams.role === 'admin' ? 'admin' : 'user';

  // Send the current file path and page to the new connection
  ws.send(JSON.stringify({ type: 'newFile', filePath: currentFilePath }));
  ws.send(JSON.stringify({ type: 'page', page: currentPage }));

  ws.on('message', (message) => {
    const data = JSON.parse(message);

    if (data.type === 'changePage') {
      currentPage = data.page;
      
      // Log the slide being broadcasted
      console.log(`Broadcasting slide change to page ${currentPage}`);

      // Broadcast the page change to all clients
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'page', page: currentPage }));
        }
      });
    } else if (data.type === 'newFile') {
      currentFilePath = data.filePath;

      // Log the new file upload event
      console.log(`New PDF file uploaded by ${role}, broadcasting file path ${currentFilePath}`);

      // Broadcast the new file path to all clients
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'newFile', filePath: currentFilePath }));
        }
      });
    }
  });

  ws.on('close', () => {
    console.log(`${role} disconnected.`);
  });
});
