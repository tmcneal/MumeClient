import net from "net";
import zlib from "zlib";
import { EventEmitter } from "events";

const IAC = 255, SB = 250, SE = 240, MCCP2 = 86, GMCP = 201;

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
    // Send the correct MPI command for XML mode as a Telnet subnegotiation (option 102)
    const state = on ? '1' : '0';
    const data = `${state}\n`;
    const cmd = `~$#EX${data.length}\n${data}`;
    // Telnet subnegotiation: IAC SB 102 <cmd> IAC SE
    const MPI = 102;
    const cmdBuf = Buffer.from(cmd, 'latin1');
    const buf = Buffer.concat([
      Buffer.from([IAC, SB, MPI]),
      cmdBuf,
      Buffer.from([IAC, SE])
    ]);
    this.sendRaw(buf);
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
        if (buf[i + 1] === 251 && buf[i + 2] === GMCP) {
          // Respond with IAC DO GMCP
          this.socket.write(Buffer.from([IAC, 253, GMCP]));
          console.log('[GMCP] Sent IAC DO GMCP');
          i += 3;
          continue;
        }
        // GMCP subnegotiation: IAC SB GMCP ... IAC SE
        if (buf[i + 1] === SB && buf[i + 2] === GMCP) {
          const se = buf.indexOf(SE, i + 3);
          if (se !== -1) {
            const gmcpData = buf.slice(i + 3, se);
            this.handleGmcp(gmcpData);
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

  private handleGmcp(gmcpData: Buffer) {
    // GMCP data is: package.message [data]
    const str = gmcpData.toString('utf8');
    const firstSpace = str.indexOf(' ');
    let pkg, data;
    if (firstSpace === -1) {
      pkg = str.trim();
      data = undefined;
    } else {
      pkg = str.slice(0, firstSpace).trim();
      data = str.slice(firstSpace + 1).trim();
    }
    let parsed: any = data;
    if (data !== undefined && data.length > 0) {
      try {
        // Try to parse as JSON or primitive
        if (data[0] === '{' || data[0] === '[') {
          parsed = JSON.parse(data);
        } else if (data[0] === '"') {
          parsed = JSON.parse(data);
        } else if (data === 'null' || data === 'true' || data === 'false' || /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(data)) {
          // Primitive: null, true, false, number
          parsed = JSON.parse('[' + data + ']')[0];
        } else {
          parsed = data;
        }
      } catch (e) {
        parsed = data;
      }
    }
    this.emit('gmcp', { package: pkg, data: parsed });
  }

  private emitData(text: string) {
    this.emit("data", text, this.xmlMode);
  }

  close() {
    this.socket.end();
  }
} 