const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const PORT = process.env.PORT || 1016;
const GRID = 15;    // 15x15 board
const WIN_LEN = 5;  // 5 in a row to win

const app = express();
app.use(cors());
app.use(express.static('public'));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});
const players = {};
const rooms = {};
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

// Check chuỗi 5
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
   
    let rr = r + d[0], cc = c + d[1];
    while (rr >= 0 && rr < size && cc >= 0 && cc < size && board[rr * size + cc] === side) {
      cells.push([rr, cc]);
      rr += d[0]; cc += d[1];
    }
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
      X: roomObj && roomObj.players && roomObj.players.X ? roomObj.players.names[roomObj.players.X] || 'X' : null,
      O: roomObj && roomObj.players && roomObj.players.O ? roomObj.players.names[roomObj.players.O] || 'O' : null,
    },
    lastMove: roomObj.lastMove,
    winner: roomObj.winner,
    winCells: roomObj.winCells
  };
}

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);
  // Tạo phòng BOT
    socket.on('createBotRoom', ({ room, playerName }) => {
        if (rooms[room]) {
            socket.emit('roomError', { message: 'Phòng đã tồn tại' });
            return;
        }

        // Tạo phòng mới với BOT
        rooms[room] = createRoomObject(room);
        const r = rooms[room];

        r.players.X = socket.id;
        r.players.O = 'BOT';
        r.players.names[socket.id] = playerName || 'X';
        r.players.names['BOT'] = '🤖 BOT';

        socket.join(room);
        players[socket.id] = { room, side: 1, name: playerName }; // X = 1

        // Gửi trạng thái phòng xuống client
        io.to(room).emit('roomState', roomStateForClient(r));
    });
  socket.on('joinRoom', ({ room, playerName }) => {
    if (!room) return socket.emit('error', { message: 'room required' });

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
      // khán giả xem nếu đã đủ 2 người chơi
      r.players.names[socket.id] = playerName || 'spectator';
    }

    io.in(room).emit('roomState', roomStateForClient(r));
    socket.emit('chatHistory', r.chat.slice(-200));
    console.log(`${playerName || socket.id} joined ${room}`);
  });

  socket.on('createRoom', ({ room, playerName }) => {
    if (!room) {
      // generate a random code
      room = Math.floor(100000 + Math.random() * 900000).toString();
    }
    if (!rooms[room]) rooms[room] = createRoomObject(room);

    const r = rooms[room];
    socket.join(room);
    if (!r.players.X) {
      r.players.X = socket.id;
      r.players.names[socket.id] = playerName || 'X';
    } else if (!r.players.O) {
      if (playerName === 'BOT' || room.includes('BOT')) {
        r.players.O = 'BOT';
        r.players.names['BOT'] = '🤖 BOT';
      } else {
        r.players.O = socket.id;
        r.players.names[socket.id] = playerName || 'O';
      }
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
    // giới hạn chat
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
  const side = player; // client gửi 1 (X) hoặc 2 (O)
  const expectedSocketId = (side === 1 ? r.players.X : r.players.O);
  if (expectedSocketId !== socket.id && expectedSocketId !== 'BOT') {
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

  // change turn if no winner
  if (r.winner === 0) r.turn = r.turn === 1 ? 2 : 1;

  // broadcast
  io.in(room).emit('newMove', { row, col, player: side });
  io.in(room).emit('roomState', roomStateForClient(r));

  // system chat nếu có winner
  if (r.winner !== 0) {
    const winnerName =
      r.winner === 3
        ? 'Hòa'
        : r.winner === 1
        ? r.players.names[r.players.X]
        : r.players.O === 'BOT'
        ? '🤖 BOT'
        : r.players.names[r.players.O];
    const sysMsg = {
      sender: 'system',
      content: r.winner === 3 ? 'Trận đấu hòa!' : `🎉 ${winnerName} thắng!`,
      timestamp: new Date().toISOString()
    };
    r.chat.push(sysMsg);
    io.in(room).emit('chatMessage', sysMsg);
  }

  // 👉 Nếu tới lượt BOT
   if (r.turn === 2 && r.players.O === 'BOT') {
      const m = botMove(r);
      if (m) {
        const idx = m.row * GRID + m.col;
        r.board[idx] = 2;
        r.lastMove = { r: m.row, c: m.col, player: 2 };

        const { winner, winCells } = checkWin(r.board, m.row, m.col, 2, GRID);
        r.winner = winner;
        r.winCells = winCells;
        
        io.to(room).emit('newMove', r.lastMove);
        io.to(room).emit('roomState', r);

        if (r.winner === 0) r.turn = 1;

        io.in(room).emit('newMove', { row: m.row, col: m.col, player: 2 });
        io.in(room).emit('roomState', roomStateForClient(r));

        if (r.winner !== 0) {
          const sysMsg = {
            sender: 'system',
            content: r.winner === 3 ? 'Trận đấu hòa!' : '🎉 🤖 BOT thắng!',
            timestamp: new Date().toISOString()
          };
          r.chat.push(sysMsg);
          io.in(room).emit('chatMessage', sysMsg);
        }
      }
    }
  });

  // --- REMATCH ---

socket.on('requestRematch', ({ room, playerName }) => {
  if (!room || !rooms[room]) return;
  const r = rooms[room];

  // thêm id người chơi đã request
  r.rematchRequests.add(socket.id);
  console.log(`[Rematch] ${playerName} yêu cầu rematch trong phòng ${room}`);

  const xId = r.players.X;
  const oId = r.players.O;


  socket.to(room).emit('rematchRequested', { playerId: socket.id, playerName });

  // nếu cả X và O đã request thì reset ngay
 if (xId && oId && r.rematchRequests.has(xId) && r.rematchRequests.has(oId)) {
    resetGame(r, room);
  } else {
    // gửi thông báo cho đối thủ (không gửi lại cho chính mình)
    socket.to(room).emit('rematchRequested', { playerId: socket.id, playerName });
    // gửi confirm cho người gửi
    socket.emit('rematchSent', { playerName });
  }
});

socket.on('acceptRematch', ({ room, playerName }) => {
  if (!room || !rooms[room]) return;
  const r = rooms[room];
  r.rematchRequests.add(socket.id);

  console.log(`[Rematch] ${playerName} đồng ý rematch trong phòng ${room}`);
  io.in(room).emit('rematchAccepted', { playerId: socket.id, playerName });

  // nếu cả X và O đã đồng ý thì reset
  if (r.players.X && r.players.O && r.rematchRequests.has(r.players.X) && r.rematchRequests.has(r.players.O)) {
    resetGame(r,room);
  }
});
socket.on('declineRematch', ({ room, playerName }) => {
  if (!room || !rooms[room]) return;
  const r = rooms[room];
  r.rematchRequests.clear();
  console.log(`[Rematch] ${playerName} từ chối rematch trong phòng ${room}`);
  io.in(room).emit('rematchDeclined', { playerId: socket.id, playerName });
  r.rematchRequests.clear();
});
// --- Helper reset game ---
function resetGame(r, room) {
  r.rematchRequests.clear();
  r.board = makeEmptyBoard(GRID);
  r.turn = 1;
  r.winner = 0;
  r.winCells = [];
  r.lastMove = null;

  console.log(`[Rematch] Reset bàn cờ tại phòng ${room}`);
  io.in(room).emit('rematchAccepted', {});
  io.in(room).emit('resetBoard', { board: r.board, lastMove: r.lastMove });
  io.in(room).emit('roomState', roomStateForClient(r));
}
  
  socket.on('leaveRoom', ({ room, playerName }) => {
    if (!room || !rooms[room]) return;
    const r = rooms[room];
    socket.leave(room);
    // remove from players map if present
    if (r.players.X === socket.id) r.players.X = null;
    if (r.players.O === socket.id) r.players.O = null;
    delete r.players.names[socket.id];
    // Nếu không còn ai trong phòng thì xoá phòng
    if (Object.keys(r.players.names).length === 0) {
      delete rooms[room];
      console.log(`Room ${room} removed (empty).`);
      return;
    }
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
      // Nếu phòng rỗng => xoá
      if (Object.keys(r.players.names).length === 0) {
        delete rooms[roomName];
        console.log(`Room ${roomName} removed (empty).`);
        continue;
      }
      if (changed) {
        io.in(roomName).emit('roomState', roomStateForClient(r));
        io.in(roomName).emit('gameOverDisconnect', {});
      }
    }
  });

});
// Bot trung bình: thắng -> chặn -> nước gần
function botMove(r) {
  const size = GRID;
  const board = r.board;

  function getCell(row, col) {
    return board[row * size + col];
  }

  function countConsecutive(row, col, dr, dc, side) {
    let count = 0;
    while (
      row >= 0 && row < size &&
      col >= 0 && col < size &&
      getCell(row, col) === side
    ) {
      count++;
      row += dr;
      col += dc;
    }
    return count;
  }

  // 1. Thắng ngay
  for (let i = 0; i < size * size; i++) {
    if (board[i] !== 0) continue;
    const row = Math.floor(i / size);
    const col = i % size;
    for (const [dr, dc] of [[1,0],[0,1],[1,1],[1,-1]]) {
      let count = 1;
      count += countConsecutive(row+dr, col+dc, dr, dc, 1);
      count += countConsecutive(row-dr, col-dc, -dr, -dc, 1);
      if (count >= 3) return { row, col };
    }
  }

  // 2. Chặn đối thủ
  for (let i = 0; i < size * size; i++) {
    if (board[i] !== 0) continue;
    const row = Math.floor(i / size);
    const col = i % size;
    for (const [dr, dc] of [[1,0],[0,1],[1,1],[1,-1]]) {
      let count = 1;
      count += countConsecutive(row+dr, col+dc, dr, dc, 1);
      count += countConsecutive(row-dr, col-dc, -dr, -dc, 1);
      if (count >= 5) return { row, col };
    }
  }

  // 3. Gần khu vực đã có
  const candidates = [];
  for (let i = 0; i < size * size; i++) {
    if (board[i] !== 0) continue;
    const row = Math.floor(i / size);
    const col = i % size;
    let score = 0;
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        if (dr === 0 && dc === 0) continue;
        const rr = row + dr, cc = col + dc;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        const val = getCell(rr, cc);
        if (val === 2) score += 2;
        if (val === 1) score += 1;
      }
    }
    if (score > 0) candidates.push({ row, col, score });
  }
  if (candidates.length > 0) {
    candidates.sort((a, b) => b.score - a.score);
    return { row: candidates[0].row, col: candidates[0].col };
  }

  // 4. random fallback
  const emptyCells = board.map((v, i) => v === 0 ? i : -1).filter(i => i >= 0);
  if (emptyCells.length === 0) return null;
  const idx = emptyCells[Math.floor(Math.random() * emptyCells.length)];
  return { row: Math.floor(idx / size), col: idx % size };
}
    
// Start server
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});