const express = require('express');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const http = require('http');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = 3000;

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `pdf-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

// File filter to only allow PDFs
const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Only PDF files are allowed'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Serve static files
app.use(express.static('public'));

// Error handling middleware
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File size limit exceeded (10MB max)' });
    }
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

// PDF upload endpoint
app.post('/upload', upload.single('pdf'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  res.json({ 
    filePath: `/uploads/${req.file.filename}`,
    fileName: req.file.filename
  });
});

// Store room information
const rooms = new Map();
const roomTimeouts = new Map();
const userTimeouts = new Map();

// Configuration
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const INACTIVE_TIMEOUT = 15 * 60 * 1000; // 15 minutes

// Generate random 6-digit room code
function generateRoomCode() {
  let code;
  do {
    code = Math.floor(100000 + Math.random() * 900000).toString();
  } while (rooms.has(code));
  return code;
}

// Clean up files for a room
function cleanupRoomFiles(roomCode) {
  const roomData = rooms.get(roomCode);
  if (roomData && roomData.files && roomData.files.length > 0) {
    roomData.files.forEach(file => {
      const filePath = path.join(uploadDir, file);
      fs.unlink(filePath, (err) => {
        if (err && err.code !== 'ENOENT') {
          console.error(`Error deleting file ${file}:`, err);
        }
      });
    });
  }
}

// Clean up room and associated resources
function cleanupRoom(roomCode) {
  cleanupRoomFiles(roomCode);
  
  // Clear all timeouts associated with the room
  if (roomTimeouts.has(roomCode)) {
    clearTimeout(roomTimeouts.get(roomCode));
    roomTimeouts.delete(roomCode);
  }

  // Clear user timeouts for all users in the room
  const roomData = rooms.get(roomCode);
  if (roomData && roomData.users) {
    roomData.users.forEach(userId => {
      if (userTimeouts.has(userId)) {
        clearTimeout(userTimeouts.get(userId));
        userTimeouts.delete(userId);
      }
    });
  }

  rooms.delete(roomCode);
}

// Reset room timeout
function resetRoomTimeout(roomCode) {
  if (roomTimeouts.has(roomCode)) {
    clearTimeout(roomTimeouts.get(roomCode));
  }

  const timeout = setTimeout(() => {
    io.to(roomCode).emit('sessionTimeout');
    cleanupRoom(roomCode);
  }, SESSION_TIMEOUT);

  roomTimeouts.set(roomCode, timeout);
}

// Reset user timeout
function resetUserTimeout(userId, roomCode) {
  if (userTimeouts.has(userId)) {
    clearTimeout(userTimeouts.get(userId));
  }

  const timeout = setTimeout(() => {
    const socket = io.sockets.sockets.get(userId);
    if (socket) {
      socket.emit('inactivityTimeout');
      socket.disconnect(true);
    }
  }, INACTIVE_TIMEOUT);

  userTimeouts.set(userId, timeout);
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
      files: [],
      users: new Set([socket.id]),
      currentFile: null
    });

    resetRoomTimeout(roomCode);
    resetUserTimeout(socket.id, roomCode);
    
    socket.emit('roomCreated', roomCode);
  });

  socket.on('joinRoom', (roomCode) => {
    if (rooms.has(roomCode)) {
      currentRoom = roomCode;
      socket.join(roomCode);
      
      const roomData = rooms.get(roomCode);
      roomData.users.add(socket.id);
      
      resetRoomTimeout(roomCode);
      resetUserTimeout(socket.id, roomCode);

      // Send current state to new user
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
        resetRoomTimeout(currentRoom);
      }
    }
  });

  socket.on('newFile', (data) => {
    if (currentRoom && rooms.has(currentRoom)) {
      const roomData = rooms.get(currentRoom);
      if (socket.id === roomData.admin) {
        // Extract filename from filepath
        const filename = path.basename(data.filePath);
        
        // Add to room's file list
        roomData.files.push(filename);
        roomData.currentFile = data.filePath;
        
        io.to(currentRoom).emit('newPDF', data);
        resetRoomTimeout(currentRoom);
      }
    }
  });

  socket.on('adminLogout', (roomCode) => {
    if (rooms.has(roomCode)) {
      io.to(roomCode).emit('adminLoggedOut');
      cleanupRoom(roomCode);
    }
  });

  socket.on('userLogout', (roomCode) => {
    if (rooms.has(roomCode)) {
      const roomData = rooms.get(roomCode);
      if (roomData.users.has(socket.id)) {
        roomData.users.delete(socket.id);
        if (userTimeouts.has(socket.id)) {
          clearTimeout(userTimeouts.get(socket.id));
          userTimeouts.delete(socket.id);
        }
        socket.leave(roomCode);
      }
    }
  });

  socket.on('disconnect', () => {
    if (currentRoom) {
      const roomData = rooms.get(currentRoom);
      if (roomData) {
        if (roomData.admin === socket.id) {
          // Admin disconnected
          io.to(currentRoom).emit('adminLoggedOut');
          cleanupRoom(currentRoom);
        } else if (roomData.users.has(socket.id)) {
          // User disconnected
          roomData.users.delete(socket.id);
          if (userTimeouts.has(socket.id)) {
            clearTimeout(userTimeouts.get(socket.id));
            userTimeouts.delete(socket.id);
          }
        }
      }
    }
  });

  // Handle activity updates
  socket.on('userActivity', () => {
    if (currentRoom) {
      resetUserTimeout(socket.id, currentRoom);
    }
  });

  // Handle errors
  socket.on('error', (error) => {
    console.error('Socket error:', error);
    socket.emit('error', 'An error occurred');
  });
});

// Periodic cleanup of old files (run every hour)
setInterval(() => {
  fs.readdir(uploadDir, (err, files) => {
    if (err) {
      console.error('Error reading upload directory:', err);
      return;
    }

    const now = Date.now();
    files.forEach(file => {
      const filePath = path.join(uploadDir, file);
      fs.stat(filePath, (err, stats) => {
        if (err) {
          console.error(`Error getting file stats for ${file}:`, err);
          return;
        }

        // Remove files older than 24 hours
        if (now - stats.mtime.getTime() > 24 * 60 * 60 * 1000) {
          fs.unlink(filePath, err => {
            if (err) console.error(`Error deleting old file ${file}:`, err);
          });
        }
      });
    });
  });
}, 60 * 60 * 1000);

// Start server
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Cleaning up...');
  
  // Clean up all rooms
  rooms.forEach((_, roomCode) => {
    cleanupRoom(roomCode);
  });

  server.close(() => {
    console.log('Server shutdown complete');
    process.exit(0);
  });
});