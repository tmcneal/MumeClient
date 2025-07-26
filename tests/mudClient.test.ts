import { test, expect, describe, beforeEach, afterAll } from "bun:test";
import { MudClient } from "../mudClient";
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

afterAll(() => {
  net.createConnection = originalCreateConnection;
}); 