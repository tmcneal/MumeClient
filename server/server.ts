import { serve } from "bun";
import { MudClient, handleMudData } from "./mud";

export function startServer({ port, mudHost, mudPort }: { port: number, mudHost: string, mudPort: number }) {
  const WS_PATH = "/ws";
  const PUBLIC_DIR = "./client/public"; // Corrected path

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
        (ws as any).data = { mud: new MudClient(mudHost, mudPort) }; // Type assertion
        const mud = (ws as any).data.mud; // Type assertion
        mud.on("connect", () => {
          ws.send(JSON.stringify({ type: "info", message: "Connected to MUD server (plain text mode)" }));
        });
        mud.on("info", (msg: string) => {
          ws.send(JSON.stringify({ type: "info", message: msg }));
        });
        mud.on("data", (text: string, xmlMode: boolean) => {
          handleMudData(ws, text, xmlMode);
        });
        mud.on("gmcp", (gmcpMsg: { package: string, data: any }) => {
          ws.send(JSON.stringify({ type: "gmcp", data: gmcpMsg }));
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
        const mud = (ws as any).data.mud; // Type assertion
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
        (ws as any).data?.mud?.close(); // Type assertion
      },
    },
  });
  console.log(`Server running at http://localhost:${port} (WebSocket at ws://localhost:${port}/ws)`);
} 