// server.js
// Realtime Caro (Gomoku) server skeleton using Express + Socket.IO
// Simple in-memory store (no DB). Good for dev / demo.

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const PORT = process.env.PORT || 3000;
const GRID = 15;    // 15x15 board
const WIN_LEN = 5;  // 5 in a row to win

const app = express();
app.use(cors());
app.use(express.static('public')); // serve client static files from ./public

const server = http.createServer(app);
const io = new Server(server, {
  // CORS: restrict in production
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// In-memory rooms
// rooms[roomCode] = { board: Int[], turn: 1|2, players: { X: socketId|null, O: socketId|null, names: { socketId: name } }, chat: [], rematchRequests: Set }
const rooms = {};

// Helpers
function makeEmptyBoard(size) {
  return new Array(size * size).fill(0); // 0 empty, 1 X, 2 O
}
function createRoomObject(room) {
  return {
    name: room,
    board: makeEmptyBoard(GRID),
    turn: 1, // X starts
    players: { X: null, O: null, names: {} },
    chat: [], // { sender, content, timestamp }
    lastMove: null,
    winner: 0, // 0 none, 1 X, 2 O, 3 draw
    winCells: [],
    rematchRequests: new Set()
  };
}

// Check 5-in-row from last move
function checkWin(board, r, c, side, size = GRID) {
  const dirs = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1]
  ];
  const winCells = [];

  for (const d of dirs) {
    const cells = [[r, c]];
    // forward
    let rr = r + d[0], cc = c + d[1];
    while (rr >= 0 && rr < size && cc >= 0 && cc < size && board[rr * size + cc] === side) {
      cells.push([rr, cc]);
      rr += d[0]; cc += d[1];
    }
    // backward
    rr = r - d[0]; cc = c - d[1];
    while (rr >= 0 && rr < size && cc >= 0 && cc < size && board[rr * size + cc] === side) {
      cells.unshift([rr, cc]);
      rr -= d[0]; cc -= d[1];
    }
    if (cells.length >= WIN_LEN) {
      return { winner: side, winCells: cells.slice(0, cells.length) }; // return all connected cells (can slice to exactly WIN_LEN if desired)
    }
  }
  // check draw
  if (!board.includes(0)) return { winner: 3, winCells: [] };
  return { winner: 0, winCells: [] };
}

function roomStateForClient(roomObj) {
  return {
    room: roomObj.name,
    board: roomObj.board,
    turn: roomObj.turn,
    players: {
      X: roomObj.players.X ? roomObj.players.names[roomObj.players.X] || 'X' : null,
      O: roomObj.players.O ? roomObj.players.names[roomObj.players.O] || 'O' : null
    },
    lastMove: roomObj.lastMove,
    winner: roomObj.winner,
    winCells: roomObj.winCells
  };
}

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  // Client may request existing chat history for room
  socket.on('joinRoom', ({ room, playerName }) => {
    if (!room) return socket.emit('error', { message: 'room required' });

    if (!rooms[room]) rooms[room] = createRoomObject(room);
    const r = rooms[room];

    socket.join(room);
    // assign role if vacancy
    if (!r.players.X) {
      r.players.X = socket.id;
      r.players.names[socket.id] = playerName || 'X';
    } else if (!r.players.O) {
      r.players.O = socket.id;
      r.players.names[socket.id] = playerName || 'O';
    } else {
      // spectator
      r.players.names[socket.id] = playerName || 'spectator';
    }

    // broadcast updated room state
    io.in(room).emit('roomState', roomStateForClient(r));
    // send chat history to the new socket
    socket.emit('chatHistory', r.chat.slice(-200));
    console.log(`${playerName || socket.id} joined ${room}`);
  });

  socket.on('createRoom', ({ room, playerName }) => {
    if (!room) {
      // generate a random code
      room = 'room_' + Math.random().toString(36).substr(2, 6);
    }
    if (!rooms[room]) rooms[room] = createRoomObject(room);

    const r = rooms[room];
    socket.join(room);
    if (!r.players.X) {
      r.players.X = socket.id;
      r.players.names[socket.id] = playerName || 'X';
    } else if (!r.players.O) {
      r.players.O = socket.id;
      r.players.names[socket.id] = playerName || 'O';
    } else {
      r.players.names[socket.id] = playerName || 'spectator';
    }

    io.in(room).emit('roomState', roomStateForClient(r));
    socket.emit('chatHistory', r.chat.slice(-200));
    socket.emit('createdRoom', { room });
    console.log(`Room created/joined: ${room} by ${playerName || socket.id}`);
  });

  socket.on('sendMessage', ({ room, sender, content, timestamp }) => {
    if (!room || !rooms[room]) return;
    const r = rooms[room];
    const msg = { sender, content, timestamp: timestamp || new Date().toISOString() };
    r.chat.push(msg);
    // limit chat size
    if (r.chat.length > 500) r.chat.shift();
    io.in(room).emit('chatMessage', msg);
  });

  socket.on('typing', ({ room, user, isTyping }) => {
    if (!room) return;
    socket.to(room).emit('userTyping', { user, isTyping });
  });

  socket.on('move', ({ room, row, col, player }) => {
    if (!room || !rooms[room]) return;
    const r = rooms[room];

    // validate
    if (r.winner && r.winner !== 0) {
      socket.emit('moveRejected', { reason: 'Game finished' });
      return;
    }
    if (row < 0 || row >= GRID || col < 0 || col >= GRID) {
      socket.emit('moveRejected', { reason: 'Invalid coordinates' });
      return;
    }
    const idx = row * GRID + col;
    if (r.board[idx] !== 0) {
      socket.emit('moveRejected', { reason: 'Cell taken' });
      return;
    }
    // check if player's socket id matches assigned side
    const side = player; // client should send 1/2
    const expectedSocketId = (side === 1 ? r.players.X : r.players.O);
    if (expectedSocketId !== socket.id) {
      socket.emit('moveRejected', { reason: 'Not your turn or not assigned side' });
      return;
    }
    if (r.turn !== side) {
      socket.emit('moveRejected', { reason: 'Lượt của đối thủ' });
      return;
    }

    // apply move
    r.board[idx] = side;
    r.lastMove = { r: row, c: col, player: side };

    // check win
    const { winner, winCells } = checkWin(r.board, row, col, side, GRID);
    r.winner = winner;
    r.winCells = winCells;

    // change turn when no winner
    if (r.winner === 0) r.turn = r.turn === 1 ? 2 : 1;

    // broadcast newMove (simple) and full roomState
    io.in(room).emit('newMove', { row, col, player: side });
    io.in(room).emit('roomState', roomStateForClient(r));

    // if winner => broadcast final state and system chat
    if (r.winner !== 0) {
      const winnerName = r.winner === 3 ? 'Hòa' : (r.winner === 1 ? r.players.names[r.players.X] : r.players.names[r.players.O]);
      const sysMsg = { sender: 'system', content: r.winner === 3 ? 'Trận đấu hòa!' : `🎉 ${winnerName} thắng!`, timestamp: new Date().toISOString() };
      r.chat.push(sysMsg);
      io.in(room).emit('chatMessage', sysMsg);
    }
  });

  socket.on('requestRematch', ({ room, playerName }) => {
    if (!room || !rooms[room]) return;
    const r = rooms[room];
    r.rematchRequests.add(socket.id);
    // notify others in room
    socket.to(room).emit('rematchRequested', { playerId: socket.id, playerName });
  });

  socket.on('acceptRematch', ({ room }) => {
    if (!room || !rooms[room]) return;
    const r = rooms[room];
    // if both players requested rematch or one accepted, we reset
    // For simplicity: when acceptRematch received, clear board and notify
    r.board = makeEmptyBoard(GRID);
    r.turn = 1;
    r.winner = 0;
    r.winCells = [];
    r.lastMove = null;
    r.rematchRequests.clear();
    io.in(room).emit('rematchAccepted', {});
    io.in(room).emit('resetBoard', { board: r.board, lastMove: r.lastMove });
    io.in(room).emit('roomState', roomStateForClient(r));
  });

  socket.on('declineRematch', ({ room, playerName }) => {
    if (!room || !rooms[room]) return;
    const r = rooms[room];
    r.rematchRequests.delete(socket.id);
    socket.to(room).emit('rematchDeclined', { playerId: socket.id, playerName });
  });

  socket.on('forceReset', ({ room }) => {
    // dev: force reset board (anyone can call in this skeleton)
    if (!room || !rooms[room]) return;
    const r = rooms[room];
    r.board = makeEmptyBoard(GRID);
    r.turn = 1;
    r.winner = 0;
    r.winCells = [];
    r.lastMove = null;
    r.rematchRequests.clear();
    io.in(room).emit('forceResetGame', {});
    io.in(room).emit('resetBoard', { board: r.board, lastMove: r.lastMove });
    io.in(room).emit('roomState', roomStateForClient(r));
  });

  socket.on('leaveRoom', ({ room, playerName }) => {
    if (!room || !rooms[room]) return;
    const r = rooms[room];
    socket.leave(room);
    // remove from players map if present
    if (r.players.X === socket.id) r.players.X = null;
    if (r.players.O === socket.id) r.players.O = null;
    delete r.players.names[socket.id];

    // if opponent remains, declare opponent winner (server policy) OR keep as spectator
    // We'll notify remaining clients.
    io.in(room).emit('roomState', roomStateForClient(r));
    io.in(room).emit('chatMessage', { sender: 'system', content: `${playerName || 'Người chơi'} đã rời phòng.`, timestamp: new Date().toISOString() });
  });

  // handle disconnect
  socket.on('disconnect', (reason) => {
    console.log('disconnect', socket.id, reason);
    // remove from any rooms and notify
    for (const roomName of Object.keys(rooms)) {
      const r = rooms[roomName];
      let changed = false;
      if (r.players.X === socket.id) { r.players.X = null; changed = true; }
      if (r.players.O === socket.id) { r.players.O = null; changed = true; }
      if (r.players.names && r.players.names[socket.id]) { delete r.players.names[socket.id]; changed = true; }
      r.rematchRequests.delete(socket.id);
      if (changed) {
        io.in(roomName).emit('roomState', roomStateForClient(r));
        io.in(roomName).emit('gameOverDisconnect', {});
      }
    }
  });

});

// Start server
server.listen(PORT, () => {
  console.log(`Caro server listening on http://localhost:${PORT}`);
});
