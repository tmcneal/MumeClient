import { startServer } from "./server";

const MUD_HOST = "mume.org";
const MUD_PORT = 4242;
const WS_PORT = 8080;

startServer({ port: WS_PORT, mudHost: MUD_HOST, mudPort: MUD_PORT });
