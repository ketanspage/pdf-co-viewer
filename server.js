const express = require('express');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const http = require('http');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = 3000;

// Storage configuration for uploaded files
const storage = multer.diskStorage({
  destination: 'public/uploads',
  filename: (req, file, cb) => {
    cb(null, 'uploaded_pdf.pdf');
  }
});
const upload = multer({ storage });

// Serve static files
app.use(express.static('public'));

// PDF upload endpoint
app.post('/upload', upload.single('pdf'), (req, res) => {
  res.json({ filePath: `/uploads/${req.file.filename}` });
});

// Store room information
const rooms = new Map();

// Generate random 6-digit room code
function generateRoomCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

io.on('connection', (socket) => {
  let currentRoom = null;

  socket.on('createRoom', () => {
    const roomCode = generateRoomCode();
    currentRoom = roomCode;
    socket.join(roomCode);
    rooms.set(roomCode, {
      admin: socket.id,
      currentPage: 1,
      currentFile: null
    });
    socket.emit('roomCreated', roomCode);
  });

  socket.on('joinRoom', (roomCode) => {
    if (rooms.has(roomCode)) {
      currentRoom = roomCode;
      socket.join(roomCode);
      const roomData = rooms.get(roomCode);
      if (roomData.currentFile) {
        socket.emit('newPDF', { filePath: roomData.currentFile });
        socket.emit('pageChange', roomData.currentPage);
      }
    } else {
      socket.emit('joinError', 'Invalid access code');
    }
  });

  socket.on('changePage', (page) => {
    if (currentRoom && rooms.has(currentRoom)) {
      const roomData = rooms.get(currentRoom);
      if (socket.id === roomData.admin) {
        roomData.currentPage = page;
        io.to(currentRoom).emit('pageChange', page);
      }
    }
  });

  socket.on('newFile', (data) => {
    if (currentRoom && rooms.has(currentRoom)) {
      const roomData = rooms.get(currentRoom);
      if (socket.id === roomData.admin) {
        roomData.currentFile = data.filePath;
        io.to(currentRoom).emit('newPDF', data);
      }
    }
  });

  socket.on('disconnect', () => {
    if (currentRoom) {
      const roomData = rooms.get(currentRoom);
      if (roomData && roomData.admin === socket.id) {
        // If admin disconnects, clean up the room
        io.to(currentRoom).emit('adminLeft');
        rooms.delete(currentRoom);
      }
    }
  });
});

server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));