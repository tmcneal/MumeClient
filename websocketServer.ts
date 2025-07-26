import { serve } from "bun";
import { MudClient } from "./mudClient";
import { handleMudData } from "./utils";

export function startWebSocketServer({ port, mudHost, mudPort }: { port: number, mudHost: string, mudPort: number }) {
  const WS_PATH = "/ws";
  const PUBLIC_DIR = "./public";

  serve({
    port,
    fetch(req, server) {
      const url = new URL(req.url);
      if (url.pathname === WS_PATH && server.upgrade) {
        server.upgrade(req);
        return new Response(null, { status: 101 });
      }
      return new Response(Bun.file(PUBLIC_DIR + (url.pathname === "/" ? "/index.html" : url.pathname)));
    },
    websocket: {
      open(ws) {
        // @ts-ignore
        ws.data = { mud: new MudClient(mudHost, mudPort) };
        const mud = ws.data.mud;
        mud.on("connect", () => {
          ws.send(JSON.stringify({ type: "info", message: "Connected to MUD server (plain text mode)" }));
        });
        mud.on("info", (msg: string) => {
          ws.send(JSON.stringify({ type: "info", message: msg }));
        });
        mud.on("data", (text: string, xmlMode: boolean) => {
          handleMudData(ws, text, xmlMode);
        });
        mud.on("end", () => {
          ws.send(JSON.stringify({ type: "info", message: "Disconnected from MUD server" }));
          ws.close();
        });
        mud.on("error", (err: Error) => {
          ws.send(JSON.stringify({ type: "error", error: err.message }));
          ws.close();
        });
      },
      async message(ws, message) {
        const mud = ws.data.mud;
        const msg = message.toString().trim();
        if (msg === "/xml on") {
          mud.setXmlMode(true);
          ws.send(JSON.stringify({ type: "info", message: "XML mode enabled" }));
          return;
        } else if (msg === "/xml off") {
          mud.setXmlMode(false);
          ws.send(JSON.stringify({ type: "info", message: "XML mode disabled" }));
          return;
        }
        mud.send(msg);
      },
      close(ws) {
        ws.data?.mud?.close();
      },
    },
  });
  console.log(`Server running at http://localhost:${port} (WebSocket at ws://localhost:${port}/ws)`);
} 