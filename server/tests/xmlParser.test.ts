import { test, expect, describe } from "bun:test";
import { parseXmlMessage } from "../xml";

describe("parseXmlMessage", () => {
  test("should parse room XML to structured JSON format", () => {
    const input = `<room id=54237 area="Dol Guldur" terrain=building>
  <name>In the Pits of Lugburz</name>
  A <object>mailbox</object> stands here stuffed full of messages.
  <exits from=54237>Exits: <exit dir=east id=7158160>east</exit>, <exit dir=west id=13527665>west</exit>.
  </exits>
</room>`;
    
    const { parsed, plain } = parseXmlMessage(input);
    
    // Single assertion that validates the complete JSON response
    expect(parsed).toEqual({
      room: {
        id: "54237",
        area: "Dol Guldur",
        terrain: "building",
        name: "In the Pits of Lugburz",
        exits: {
          east: "7158160",
          west: "13527665"
        }
      },
      raw: "In the Pits of Lugburz A mailbox stands here stuffed full of messages. Exits: east, west."
    });
    
    // Also verify plain text output
    expect(plain).toBe("In the Pits of Lugburz\n  A mailbox stands here stuffed full of messages.\n  Exits: east, west.");
  });

  test("should parse status XML fragments to structured format", () => {
    const input = "<status>429</status>/<status>430</status> hits, <status>62</status>/<status>63</status> mana, and <status>130</status>/<status>131</status> moves";
    
    const { parsed, plain } = parseXmlMessage(input);
    
    expect(parsed).toEqual({
      status: {
        hits: {
          current: 429,
          max: 430
        },
        mana: {
          current: 62,
          max: 63
        },
        moves: {
          current: 130,
          max: 131
        }
      },
      raw: "429/430 hits, 62/63 mana, and 130/131 moves."
    });
    
    expect(plain).toBe("429/430 hits, 62/63 mana, and 130/131 moves");
  });

  test("should handle simple XML elements", () => {
    const input = "<root>hello world</root>";
    const { parsed, plain } = parseXmlMessage(input);
    
    expect(parsed).toEqual({
      root: {
        _: "hello world"
      }
    });
    expect(plain).toBe("hello world");
  });

  test("should handle self-closing tags", () => {
    const input = "<movement dir=south/>";
    const { parsed, plain } = parseXmlMessage(input);
    
    expect(parsed).toEqual({
      movement: {
        dir: "south"
      }
    });
    expect(plain).toBe("");
  });

  test("should handle mixed content with XML fragments", () => {
    const input = "Some text <tag>content</tag> more text <selfclosing/>";
    const { parsed, plain } = parseXmlMessage(input);
    
    expect(parsed).toEqual({
      tag: {
        _: "content"
      },
      selfclosing: {}
    });
    expect(plain).toBe("Some text content more text");
  });

  test("should handle invalid XML gracefully", () => {
    const input = "This is not XML at all";
    const { parsed, plain } = parseXmlMessage(input);
    
    expect(parsed).toBeNull();
    expect(plain).toBe("This is not XML at all");
  });
}); 