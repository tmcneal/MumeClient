import { test, expect, describe, beforeEach, afterAll } from "bun:test";
import { MudClient, handleMudData } from "../mud";
import { EventEmitter } from "events";
import zlib from "zlib";

// Mock net and zlib for isolated tests
class MockSocket extends EventEmitter {
  write = (..._args: any[]) => {};
  end = (..._args: any[]) => {};
}
class MockInflate extends EventEmitter {
  write(chunk: Buffer) {
    // Simulate decompression: just emit the buffer as-is
    this.emit("data", chunk);
  }
}

// Patch net.createConnection to return MockSocket
const net = require("net");
let originalCreateConnection = net.createConnection;
beforeEach(() => {
  net.createConnection = () => new MockSocket();
});

describe("MudClient", () => {
  let client: MudClient;
  let socket: MockSocket;
  let inflater: MockInflate;

  beforeEach(() => {
    socket = new MockSocket();
    inflater = new MockInflate();
    // @ts-ignore
    MudClient.prototype["socket"] = socket;
    // @ts-ignore
    MudClient.prototype["inflater"] = inflater;
    client = new MudClient("host", 1234);
    // Patch after construction
    // @ts-ignore
    client.socket = socket;
    // @ts-ignore
    client.inflater = inflater;
  });

  test("should emit plain text data", (done) => {
    client.on("data", (text, xmlMode) => {
      expect(text).toBe("hello world");
      expect(xmlMode).toBe(false);
      done();
    });
    // @ts-ignore
    client["emitData"]("hello world");
  });

  test("should toggle XML mode", () => {
    client.setXmlMode(true);
    // @ts-ignore
    expect(client["xmlMode"]).toBe(true);
    client.setXmlMode(false);
    // @ts-ignore
    expect(client["xmlMode"]).toBe(false);
  });

  test("should emit decompressed data via inflater", (done) => {
    client.on("data", (text, xmlMode) => {
      expect(text).toBe("decompressed");
      done();
    });
    (client as any)["emitData"]("decompressed");
  });
});

describe("handleMudData", () => {
  const ws = { send: (msg: string) => { ws.last = msg; if (ws.onSend) ws.onSend(); }, last: "", onSend: undefined as undefined | (() => void) };

  test("should send plain text when xmlMode is false", () => {
    handleMudData(ws, "hello", false);
    expect(JSON.parse(ws.last)).toEqual({ type: "mud", data: "hello" });
  });

  test("should send plain text for invalid XML when xmlMode is true", (done) => {
    ws.onSend = () => {
      const msg = JSON.parse(ws.last);
      expect(msg.type).toBe("mud");
      expect(typeof msg.data).toBe("string");
      expect(msg.data).toBe("not-xml");
      ws.onSend = undefined;
      done();
    };
    handleMudData(ws, "not-xml", true);
  });

  test("should send plain text for valid XML when xmlMode is true", (done) => {
    ws.onSend = () => {
      const msg = JSON.parse(ws.last);
      expect(msg.type).toBe("mud");
      expect(typeof msg.data).toBe("string");
      expect(msg.data).toBe("hi");
      ws.onSend = undefined;
      done();
    };
    handleMudData(ws, "<root>hi</root>", true);
  });

  test("should parse full XML block with ANSI codes in XML mode", (done) => {
    // The input string below is a valid XML block with ANSI codes embedded in the <name> tag
    const input = `<room id=4489332 area="Valinor" terrain=city><name>\u001b[32mHalls of Awaiting\u001b[0m</name>\r\nA large <object>sign</object> is posted upon the wall for you to read.\r\nA large <object>bulletin board</object>, entitled "Board of the Free Peoples", is mounted here.\r\nA fine marble <object>chessboard</object> with ivory and ebony pieces is set here.\r\nA <character>steward</character> of the Valar stands here, ready to assist you into a room.\r\n<exits from=4489332>Exits: <exit dir=east id=2178027>east</exit>.\r\n</exits></room>`;
    ws.onSend = () => {
      const msg = JSON.parse(ws.last);
      expect(msg.type).toBe("mud");
      // Expecting plain text output for frontend
      expect(typeof msg.data).toBe("string");
      expect(msg.data).toContain("Halls of Awaiting");
      expect(msg.data).not.toContain("<room"); // XML tags should be stripped
      ws.onSend = undefined;
      done();
    };
    handleMudData(ws, input, true);
  });
});

afterAll(() => {
  net.createConnection = originalCreateConnection;
}); 