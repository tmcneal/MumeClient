import net from "net";
import zlib from "zlib";
import { EventEmitter } from "events";
import { parseGmcpMessage, createGmcpResponse, isGmcpNegotiation, isGmcpSubnegotiation } from "./gmcp";
import { parseMudOutput } from "./text";

const IAC = 255, SB = 250, SE = 240, MCCP2 = 86;

// Regex to match ANSI escape codes
const ANSI_REGEX = /\x1b\[[0-9;]*m/g;

export interface MudClientOptions {
  xmlMode?: boolean;
}

export class MudClient extends EventEmitter {
  private socket: net.Socket;
  private mccp: boolean = false;
  private inflater?: zlib.Inflate;
  private leftover: Buffer | null = null;
  private xmlMode: boolean = false;

  constructor(public host: string, public port: number, opts: MudClientOptions = {}) {
    super();
    this.xmlMode = !!opts.xmlMode;
    this.socket = net.createConnection({ host, port }, () => {
      this.emit("connect");
    });
    this.socket.on("data", this.handleData.bind(this));
    this.socket.on("end", () => this.emit("end"));
    this.socket.on("error", (err) => this.emit("error", err));
  }

  send(data: string) {
    this.socket.write(data + "\n");
  }

  setXmlMode(on: boolean) {
    this.xmlMode = on;
    // Send MPI command as plain text with proper newline
    // Format: ~$#EX1\n<state>\n where <state> is "0" to disable or "1" to enable
    const state = on ? '1' : '0';
    const plainCmd = `\n~$#EX1\n${state}\n`;
    console.log('[XML MODE] Sending plain text command:', JSON.stringify(plainCmd));
    this.sendRaw(plainCmd);
  }

  private sendRaw(data: string | Buffer) {
    if (typeof data === 'string') {
      console.log('[TO MUD]', JSON.stringify(data));
      this.socket.write(data);
    } else {
      console.log('[TO MUD HEX]', data.toString('hex'));
      this.socket.write(data);
    }
  }

  private handleData(data: Buffer) {
    // Log all incoming data from the MUD
    console.log('[FROM MUD]', data, '| as string:', data.toString());
    let buf = this.leftover ? Buffer.concat([this.leftover, data]) : data;
    let i = 0;
    while (i < buf.length) {
      if (buf[i] === IAC) {
        // GMCP negotiation: IAC WILL GMCP
        if (isGmcpNegotiation(buf, i)) {
          this.socket.write(createGmcpResponse());
          console.log('[GMCP] Sent IAC DO GMCP');
          i += 3;
          continue;
        }
        // GMCP subnegotiation: IAC SB GMCP ... IAC SE
        if (isGmcpSubnegotiation(buf, i)) {
          const se = buf.indexOf(SE, i + 3);
          if (se !== -1) {
            const gmcpData = buf.slice(i + 3, se);
            const gmcpMessage = parseGmcpMessage(gmcpData);
            this.emit('gmcp', gmcpMessage);
            i = se + 1;
            continue;
          } else {
            this.leftover = buf.slice(i);
            return;
          }
        }
        if (buf[i + 1] === SE) {
          i += 2;
          continue;
        } else {
          i += 3;
          continue;
        }
      }
      if (this.mccp && this.inflater) {
        const nextIAC = buf.indexOf(IAC, i);
        const end = nextIAC === -1 ? buf.length : nextIAC;
        const compressed = buf.slice(i, end);
        this.inflater.write(compressed);
        i = end;
      } else {
        const nextIAC = buf.indexOf(IAC, i);
        const end = nextIAC === -1 ? buf.length : nextIAC;
        const plain = buf.slice(i, end).toString();
        this.emitData(plain);
        i = end;
      }
    }
    this.leftover = null;
  }

  private emitData(text: string) {
    this.emit("data", text, this.xmlMode);
  }

  close() {
    this.socket.end();
  }
}

export async function handleMudData(ws: any, text: string, xmlMode: boolean) {
  if (xmlMode) {
    // Strip ANSI codes
    const clean = text.replace(ANSI_REGEX, "");
    // Parse XML and get both structured data and plain text
    const { parsed, plain } = parseMudOutput(clean);
    
    // Log the JSON output
    console.log('[PARSED XML JSON]', JSON.stringify(parsed, null, 2));
    
    // For the web frontend, send only the plain text, split on newlines
    if (plain) {
      plain.split(/\r?\n/).forEach(line => {
        if (line.trim()) {
          ws.send(JSON.stringify({ type: "mud", data: line.trim() }));
        }
      });
    }
  } else {
    // Strip ANSI color codes, split on newlines, and send each line separately
    text.replace(ANSI_REGEX, "").split(/\r?\n/).forEach(line => {
      if (line.trim() !== "") {
        ws.send(JSON.stringify({ type: "mud", data: line }));
      }
    });
  }
} 