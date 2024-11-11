const express = require('express');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const PORT = 3000;

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// Start HTTP server
const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// Initialize WebSocket server
const wss = new WebSocket.Server({ server });

// Track the current page
let currentPage = 1;

// Handle WebSocket connections
wss.on('connection', (ws) => {
  console.log('New client connected');

  // Send the current page to the newly connected client
  ws.send(JSON.stringify({ type: 'page', page: currentPage }));

  // Listen for messages from clients
  ws.on('message', (message) => {
    const data = JSON.parse(message);

    // Handle page change message from admin
    if (data.type === 'changePage') {
      currentPage = data.page; // Update the current page number

      // Broadcast the page change to all connected clients
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'page', page: currentPage }));
        }
      });

      console.log(`Page changed to ${currentPage}, broadcasted to all clients`);
    }
  });

  // Handle client disconnects
  ws.on('close', () => {
    console.log('Client disconnected');
  });
});
