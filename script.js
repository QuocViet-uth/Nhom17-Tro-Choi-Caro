// script.js - Caro realtime client (socket.io)
// Client implements: create/join room, render board, click -> emit 'move', chat send

const GRID = 15;

// DOM refs
const lobby = document.getElementById('lobby');
const game = document.getElementById('game');
const playerNameInput = document.getElementById('playerNameInput');
const roomInput = document.getElementById('roomInput');
const btnCreate = document.getElementById('btnCreate');
const btnJoin = document.getElementById('btnJoin');
const lobbyError = document.getElementById('lobbyError');
const connStatus = document.getElementById('connStatus');

const roomLabel = document.getElementById('roomLabel');
const meLabel = document.getElementById('meLabel');
const meSide = document.getElementById('meSide');
const statusText = document.getElementById('statusText');
const caroBoard = document.getElementById('caroBoard');
const btnLeave = document.getElementById('btnLeave');
const btnRematch = document.getElementById('btnRematch');
const btnReset = document.getElementById('btnReset');

const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const typingIndicator = document.getElementById('typingIndicator');
const chatConn = document.getElementById('chatConn');

// State
let socket;
let playerName = '';
let roomCode = '';
let playerSide = 0; // 1 = X, 2 = O, 0 spectator
let boardState = new Array(GRID * GRID).fill(0);
let lastMove = null;
let isMyTurn = false;
let typingTimeout = null;

// Create board cells
function createBoardUI() {
  caroBoard.innerHTML = '';
  document.documentElement.style.setProperty('--grid-size', GRID);
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const idx = r * GRID + c;
      const cell = document.createElement('div');
      cell.className = 'caro-cell';
      if (r === 0) cell.classList.add('row-first');
      if (c === 0) cell.classList.add('col-first');
      cell.dataset.r = r;
      cell.dataset.c = c;
      cell.dataset.idx = idx;
      cell.dataset.value = '';
      cell.addEventListener('click', onCellClick);
      caroBoard.appendChild(cell);
    }
  }
}
createBoardUI();

// Connect to server
function connect() {
  socket = io();

  socket.on('connect', () => {
    connStatus.textContent = 'Đã kết nối';
    connStatus.style.color = '#27ae60';
    chatConn.textContent = 'Đã kết nối';
  });

  socket.on('disconnect', () => {
    connStatus.textContent = 'Mất kết nối';
    connStatus.style.color = '#e74c3c';
    chatConn.textContent = 'Mất kết nối';
  });

  // chat history and messages
  socket.on('chatHistory', (msgs) => {
    msgs.forEach(m => appendChat(m));
  });
  socket.on('chatMessage', (m) => appendChat(m));

  socket.on('userTyping', (d) => {
    if (d.isTyping) {
      typingIndicator.style.display = 'block';
      typingIndicator.textContent = `${d.user} đang nhập...`;
    } else {
      typingIndicator.style.display = 'none';
    }
  });

  // room / game events
  socket.on('roomState', (state) => {
    // state: { room, board, turn, players: {X: name, O: name}, lastMove, winner, winCells }
    boardState = state.board.slice();
    lastMove = state.lastMove || null;
    renderBoard();
    roomLabel.textContent = state.room;
    meLabel.textContent = playerName;
    // determine side by name match
    if (state.players && state.players.X === playerName) playerSide = 1;
    else if (state.players && state.players.O === playerName) playerSide = 2;
    else playerSide = 0;
    meSide.textContent = playerSide === 1 ? 'X (✖)' : (playerSide === 2 ? 'O (◯)' : 'Khán giả');

    // set turn
    if (state.winner && state.winner !== 0) {
      if (state.winner === 3) statusText.textContent = 'Hòa!';
      else statusText.textContent = `${state.winner === 1 ? 'X' : 'O'} thắng!`;
      if (state.winCells && state.winCells.length) highlightWin(state.winCells);
    } else {
      statusText.textContent = `Lượt: ${state.turn === 1 ? 'X' : 'O'}` + (playerSide === state.turn ? ' — Tới lượt bạn' : '');
      isMyTurn = (playerSide === state.turn);
    }
  });

  socket.on('newMove', (m) => {
    // { row, col, player }
    boardState[m.row * GRID + m.col] = m.player;
    lastMove = { r: m.row, c: m.col, player: m.player };
    renderBoard();
  });

  socket.on('moveRejected', (data) => {
    alert('Nước đi bị từ chối: ' + (data.reason || 'Không hợp lệ'));
  });

  socket.on('chatError', (d) => {
    appendChat({ sender: 'system', content: `❌ ${d.message}`, timestamp: new Date().toISOString(), type: 'system' });
  });

  socket.on('rematchRequested', (data) => {
    appendChat({ sender: 'system', content: `${data.playerName} đã yêu cầu chơi lại.`, timestamp: new Date().toISOString(), type: 'system' });
  });
  socket.on('rematchAccepted', () => {
    appendChat({ sender: 'system', content: 'Rematch: Đã đồng ý', timestamp: new Date().toISOString(), type: 'system' });
  });

  socket.on('resetBoard', (data) => {
    boardState = data.board.slice();
    lastMove = data.lastMove || null;
    renderBoard();
    statusText.textContent = 'Bàn đã reset';
  });

  socket.on('gameOverDisconnect', () => {
    appendChat({ sender: 'system', content: 'Đối thủ đã rời. Bạn thắng.', timestamp: new Date().toISOString(), type: 'system' });
  });
}

// UI handlers: create/join
btnCreate.addEventListener('click', () => {
  const name = playerNameInput.value.trim();
  let room = roomInput.value.trim();
  if (!name || name.length < 2) { showLobbyError('Tên ít nhất 2 ký tự'); return; }
  playerName = name;
  if (!room) room = 'room_' + Math.random().toString(36).substr(2,6);
  roomCode = room;
  socket.emit('createRoom', { room, playerName });
  enterGame();
});

btnJoin.addEventListener('click', () => {
  const name = playerNameInput.value.trim();
  const room = roomInput.value.trim();
  if (!name || name.length < 2) { showLobbyError('Tên ít nhất 2 ký tự'); return; }
  if (!room) { showLobbyError('Nhập mã phòng để tham gia'); return; }
  playerName = name;
  roomCode = room;
  socket.emit('joinRoom', { room, playerName });
  enterGame();
});

function showLobbyError(msg) {
  lobbyError.style.display = 'block';
  lobbyError.textContent = msg;
  setTimeout(() => lobbyError.style.display = 'none', 3000);
}

function enterGame() {
  lobby.classList.add('hidden');
  game.classList.remove('hidden');
  roomLabel.textContent = roomCode;
  meLabel.textContent = playerName;
  meSide.textContent = '...';
  statusText.textContent = 'Chờ cập nhật phòng từ server...';
}

// board click
function onCellClick(e) {
  const el = e.currentTarget;
  const r = parseInt(el.dataset.r, 10);
  const c = parseInt(el.dataset.c, 10);
  // checks
  if (!socket || !socket.connected) {
    appendChat({ sender: 'system', content: 'Không có kết nối', timestamp: new Date().toISOString(), type: 'system' });
    return;
  }
  if (playerSide === 0) {
    appendChat({ sender: 'system', content: 'Bạn là khán giả, không thể đánh', timestamp: new Date().toISOString(), type: 'system' });
    return;
  }
  // send move (server validates)
  socket.emit('move', { room: roomCode, row: r, col: c, player: playerSide });
}

// render board from boardState
function renderBoard() {
  for (let i = 0; i < GRID * GRID; i++) {
    const cell = caroBoard.children[i];
    const v = boardState[i];
    cell.dataset.value = v === 0 ? '' : (v === 1 ? 'X' : 'O');
    cell.textContent = v === 0 ? '' : (v === 1 ? '✖' : '◯');
    cell.classList.remove('last-move', 'win');
  }
  if (lastMove) {
    const idx = lastMove.r * GRID + lastMove.c;
    if (caroBoard.children[idx]) caroBoard.children[idx].classList.add('last-move');
  }
}

// highlight win
function highlightWin(cells) {
  cells.forEach(p => {
    const idx = p.r * GRID + p.c;
    if (caroBoard.children[idx]) caroBoard.children[idx].classList.add('win');
  });
}

// chat
sendBtn.addEventListener('click', sendChat);
chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendChat();
  // typing indicator
  if (socket && socket.connected) {
    socket.emit('typing', { room: roomCode, user: playerName, isTyping: true });
    if (typingTimeout) clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      socket.emit('typing', { room: roomCode, user: playerName, isTyping: false });
    }, 800);
  }
});
function sendChat() {
  const txt = chatInput.value.trim();
  if (!txt) return;
  if (!socket || !socket.connected) {
    appendChat({ sender: 'system', content: 'Không thể gửi: mất kết nối', timestamp: new Date().toISOString(), type: 'system' });
    return;
  }
  const msg = { room: roomCode, sender: playerName, content: txt, timestamp: new Date().toISOString() };
  socket.emit('sendMessage', msg);
  chatInput.value = '';
}

// append chat message element
function appendChat(m) {
  const div = document.createElement('div');
  if (m.type === 'system' || m.sender === 'system') {
    div.className = 'message msg-system';
    div.textContent = m.content;
  } else {
    const own = m.sender === playerName;
    div.className = 'message ' + (own ? 'msg-own' : 'msg-other');
    const who = document.createElement('div'); who.style.fontWeight = 800; who.style.fontSize = '12px';
    who.textContent = m.sender;
    const txt = document.createElement('div'); txt.textContent = m.content;
    const time = document.createElement('div'); time.style.fontSize='11px'; time.style.color='var(--muted)';
    time.textContent = (new Date(m.timestamp)).toLocaleTimeString();
    div.appendChild(who); div.appendChild(txt); div.appendChild(time);
  }
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// rematch / reset / leave
btnRematch.addEventListener('click', () => {
  if (!socket || !socket.connected) { appendChat({ sender: 'system', content: 'Không kết nối', timestamp: new Date().toISOString(), type: 'system' }); return; }
  socket.emit('requestRematch', { room: roomCode, playerName });
  appendChat({ sender: 'system', content: 'Đã gửi yêu cầu chơi lại', timestamp: new Date().toISOString(), type: 'system' });
});
btnReset.addEventListener('click', () => {
  if (socket && socket.connected) socket.emit('forceReset', { room: roomCode });
});
btnLeave.addEventListener('click', () => {
  if (socket && socket.connected) socket.emit('leaveRoom', { room: roomCode, playerName });
  location.reload();
});

// create board UI on load
function init() {
  // create GRID cells
  caroBoard.innerHTML = '';
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const cell = document.createElement('div');
      cell.className = 'caro-cell';
      if (r === 0) cell.classList.add('row-first');
      if (c === 0) cell.classList.add('col-first');
      cell.dataset.r = r; cell.dataset.c = c;
      cell.addEventListener('click', onCellClick);
      caroBoard.appendChild(cell);
    }
  }
  connect();
}

init();
