import { test, expect, describe } from "bun:test";
import { handleMudData } from "../utils";

const ws = { send: (msg: string) => { ws.last = msg; if (ws.onSend) ws.onSend(); }, last: "", onSend: undefined as undefined | (() => void) };

const xml2js = require("xml2js");
const originalParse = xml2js.parseStringPromise;

describe("handleMudData", () => {
  test("should send plain text when xmlMode is false", () => {
    handleMudData(ws, "hello", false);
    expect(JSON.parse(ws.last)).toEqual({ type: "mud", data: "hello" });
  });

  test("should send error for invalid XML when xmlMode is true", (done) => {
    xml2js.parseStringPromise = () => Promise.reject(new Error("Invalid XML"));
    ws.onSend = () => {
      const msg = JSON.parse(ws.last);
      expect(msg.type).toBe("error");
      expect(msg.error).toMatch(/Invalid XML/);
      xml2js.parseStringPromise = originalParse;
      ws.onSend = undefined;
      done();
    };
    handleMudData(ws, "not-xml", true);
  });

  test("should send parsed XML when xmlMode is true", (done) => {
    xml2js.parseStringPromise = () => Promise.resolve({ root: "hi" });
    ws.onSend = () => {
      const msg = JSON.parse(ws.last);
      expect(msg.type).toBe("mud");
      expect(msg.data).toHaveProperty("root");
      xml2js.parseStringPromise = originalParse;
      ws.onSend = undefined;
      done();
    };
    handleMudData(ws, "<root>hi</root>", true);
  });
}); 