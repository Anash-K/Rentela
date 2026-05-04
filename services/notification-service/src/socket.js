import { Server } from "socket.io";

let ioInstance = null;

function parseOrigins() {
  const raw = process.env.NOTIFICATION_SOCKET_CORS_ORIGIN || process.env.CORS_ORIGIN;
  if (!raw) return ["http://localhost:3000"];
  return raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

export function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: parseOrigins(),
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    socket.on("join-user", (userId) => {
      if (!userId) return;
      socket.join(`user:${String(userId)}`);
    });

    socket.on("leave-user", (userId) => {
      if (!userId) return;
      socket.leave(`user:${String(userId)}`);
    });
  });

  ioInstance = io;
  return io;
}

export function emitNotification(notification) {
  if (!ioInstance || !notification) return;

  ioInstance.emit("notification", notification);

  if (notification.userId) {
    ioInstance.to(`user:${notification.userId}`).emit("notification", notification);
  }
}
