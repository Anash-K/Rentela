import http from "http";
import app from "./app.js";
import { initSocket } from "./socket.js";

const PORT = process.env.PORT || 5020;

const server = http.createServer(app);

// 🔥 attach socket here
initSocket(server);

server.listen(PORT, () => {
  console.log(`Telematics service running on ${PORT}`);
});
