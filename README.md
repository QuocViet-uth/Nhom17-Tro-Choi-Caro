🎲 Caro Online với Chat Thời Gian Thực
Một ứng dụng Cờ Caro trực tuyến với tính năng chat thời gian thực, được xây dựng bằng Node.js, Express, Socket.IO.

✨ Tính năng
🎮 Game Cờ Caro
Chơi cờ caro real-time với bạn bè hoặc với bot
Giao diện bàn cờ đẹp, 15x15 ô
Áp dụng luật thắng 5 quân liên tiếp
Hiển thị trạng thái game (lượt chơi, thắng/thua/hòa)

🔄 Chức năng Rematch: Yêu cầu chơi lại sau khi game kết thúc
🤖 Bot cơ bản: Chơi với máy (bot có khả năng chặn 3 nước liền)

💬 Chat Thời Gian Thực
Tin nhắn real-time: Gửi và nhận tin nhắn ngay lập tức
Typing indicator: Hiển thị khi đối thủ đang nhập tin nhắn
Lịch sử chat: Lưu trữ tin nhắn trong phòng
Tin nhắn hệ thống: Thông báo sự kiện game (tham gia, rời, rematch…)
Responsive: Hoạt động tốt trên mobile và desktop

🎨 Giao diện
Thiết kế hiện đại với gradient và hiệu ứng glass morphism
Responsive cho mọi thiết bị
Animations mượt mà
Có nhạc nền và điều chỉnh âm lượng

🚀 Cách chạy
1. Cài đặt dependencies
npm install

2. Chạy server
node server.js

3. Truy cập ứng dụng
Mở trình duyệt: http://localhost:3000
🎯 Cách sử dụng
Tạo phòng mới
Vào trang chủ
Nhập tên và nhấn "Tạo phòng"
Chia sẻ mã phòng cho bạn bè
Tham gia phòng
Nhập tên và mã phòng
Nhấn "Tham gia"
Bắt đầu chơi
Chơi với Bot
Nhấn nút "Chơi với Bot"
Hệ thống tự tạo phòng và bot làm đối thủ
Chat
Nhập tin nhắn và nhấn Enter hoặc nút Gửi
Khi đối thủ đang nhập sẽ hiển thị thông báo "Đang nhập..."
Rematch
Sau khi game kết thúc, có thể gửi yêu cầu Chơi lại
Đối thủ chọn Đồng ý/Từ chối
Nếu đồng ý, game mới bắt đầu ngay
🛠️ Công nghệ sử dụng
Backend
Node.js: Runtime
Express: Web server
Socket.IO: Real-time communication

Frontent
HTML5/CSS3/JS
Custom UI cho Caro (grid 15x15)
DOM manipulation thuần JS

📁 Cấu trúc dự án
caro-online/
├── server.js              # Express + Socket.IO server
├── package.json           # Dependencies
├── public/
│   ├── index.html         # Trang chính (lobby + game)
│   ├── style.css          # Giao diện
│   ├── client.js          # Logic client (caro + chat)
│   └── assets/            # Âm thanh, hình ảnh
└── README.md              # Tài liệu dự án

🔧 Socket Events
Game
createRoom / joinRoom: Tạo hoặc tham gia phòng
roomState: Trạng thái phòng (board, turn, players)
move: Gửi nước đi
newMove: Nhận nước đi mới
moveRejected: Nước đi không hợp lệ
gameOverDisconnect: Thắng vì đối thủ thoát
Rematch
requestRematch
acceptRematch
declineRematch
resetBoard
Chat
sendMessage
chatMessage
chatHistory
typing / userTyping

🎨 Giao diện
Layout
Bên trái: Bàn cờ
Bên phải: Chat box
Responsive: Trên mobile sẽ xếp dọc
Message Types
Own messages: Tin nhắn của mình (xanh)
Other messages: Tin nhắn đối thủ (xám)
System messages: Thông báo (đỏ/xám nhạt)
Hiệu ứng
Highlight nước đi cuối
Highlight 5 quân thắng
Animation cho nút và chat
🔒 Bảo mật
Giới hạn độ dài tin nhắn
Kiểm tra nước đi hợp lệ
Tách biệt phòng (isolation)
🚀 Deployment
Local
npm install
node server.js

Production
npm install --production
NODE_ENV=production node server.js

📝 License
MIT License

