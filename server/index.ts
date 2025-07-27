import { startWebSocketServer } from "./websocketServer";

const MUD_HOST = "mume.org";
const MUD_PORT = 4242;
const WS_PORT = 8080;

startWebSocketServer({ port: WS_PORT, mudHost: MUD_HOST, mudPort: MUD_PORT });