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
      expect(msg.type).toBe("mud");
      expect(msg.data.xml).toBeDefined();
      expect(msg.data.text).toBeDefined();
      expect(msg.data.xml.length).toBe(0);
      expect(msg.data.text.length).toBeGreaterThan(0);
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
      expect(msg.data.xml).toBeDefined();
      expect(msg.data.text).toBeDefined();
      expect(msg.data.xml.length).toBe(1);
      expect(msg.data.xml[0]).toHaveProperty("root");
      xml2js.parseStringPromise = originalParse;
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
      expect(msg.data.xml.length).toBe(1);
      expect(msg.data.text.length).toBe(0);
      expect(msg.data.xml[0]).toHaveProperty("room");
      // htmlparser2: children are in .room.children
      const roomChildren = msg.data.xml[0].room.children;
      const nameNode = roomChildren.find((c: any) => c.name);
      expect(nameNode).toBeDefined();
      expect(nameNode.name).toHaveProperty("_"); // The text content
      ws.onSend = undefined;
      done();
    };
    handleMudData(ws, input, true);
  });
}); 