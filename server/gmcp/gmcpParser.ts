// GMCP protocol constants
const IAC = 255;
const SB = 250;
const SE = 240;
const GMCP = 201;

export interface GmcpMessage {
  package: string;
  data: any;
}

export function parseGmcpMessage(gmcpData: Buffer): GmcpMessage {
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
  return { package: pkg, data: parsed };
}

export function createGmcpResponse(): Buffer {
  // Respond with IAC DO GMCP
  return Buffer.from([IAC, 253, GMCP]);
}

export function isGmcpNegotiation(buffer: Buffer, index: number): boolean {
  return buffer[index] === IAC && buffer[index + 1] === 251 && buffer[index + 2] === GMCP;
}

export function isGmcpSubnegotiation(buffer: Buffer, index: number): boolean {
  return buffer[index] === IAC && buffer[index + 1] === SB && buffer[index + 2] === GMCP;
} 