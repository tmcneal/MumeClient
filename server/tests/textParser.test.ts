import { test, expect, describe } from "bun:test";
import { parseMudOutput } from "../text";

describe("parseMudOutput", () => {
  test("should parse room XML to structured JSON format", () => {
    const input = `<room id=54237 area="Dol Guldur" terrain=building>
  <name>In the Pits of Lugburz</name>
  A <object>mailbox</object> stands here stuffed full of messages.
  <exits from=54237>Exits: <exit dir=east id=7158160>east</exit>, <exit dir=west id=13527665>west</exit>.
  </exits>
</room>`;
    
    const { parsed, plain } = parseMudOutput(input);
    
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
    
    const { parsed, plain } = parseMudOutput(input);
    
    expect(parsed).toEqual({
      score: {
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

  test("should parse stats XML fragments to structured format", () => {
    const input = "OB: <status>133</status>%, DB: <status>14</status>%, PB: <status>0</status>%, Armour: <status>5</status>%. Wimpy: <status>429</status>. Mood: <status>wimpy</status>.\nNeeded: <status>111,315</status> xp, <status>3</status> tp. Gold: <status>0</status>. Alert: <status>normal</status>.";
    
    const { parsed, plain } = parseMudOutput(input);
    
    expect(parsed).toEqual({
      stats: {
        ob: 133,
        db: 14,
        pb: 0,
        armour: 5,
        wimpy: 429,
        mood: "wimpy",
        xp: 111315,
        tp: 3,
        gold: 0,
        alert: "normal"
      },
      raw: "OB: 133%, DB: 14%, PB: 0%, Armour: 5%. Wimpy: 429. Mood: wimpy.\nNeeded: 111,315 xp, 3 tp. Gold: 0. Alert: normal."
    });
    
    expect(plain).toBe("OB: 133%, DB: 14%, PB: 0%, Armour: 5%. Wimpy: 429. Mood: wimpy.\nNeeded: 111,315 xp, 3 tp. Gold: 0. Alert: normal.");
  });

  test("should parse hit XML output to structured format", () => {
    const input = "<hit>You strongly hit a <character>snaga orc</character>'s right hand.</hit>";
    
    const { parsed, plain } = parseMudOutput(input);
    
    expect(parsed).toEqual({
      hit: {
        target: "snaga orc"
      },
      raw: "You strongly hit a snaga orc's right hand."
    });
    
    expect(plain).toBe("You strongly hit a snaga orc's right hand.");
  });

  test("should parse damage XML output to structured format", () => {
    const input = "<damage>A <character>snaga orc</character> lightly crushes your left leg and tickles it.</damage>";
    
    const { parsed, plain } = parseMudOutput(input);
    
    expect(parsed).toEqual({
      damage: {
        source: "snaga orc"
      },
      raw: "A snaga orc lightly crushes your left leg and tickles it."
    });
    
    expect(plain).toBe("A snaga orc lightly crushes your left leg and tickles it.");
  });

  test("should parse tell XML output with mixed content to structured format", () => {
    const input = "<tell><character><player>Suvorov</player></character> tells you 'alright'</tell>";
    
    const { parsed, plain } = parseMudOutput(input);
    
    expect(parsed).toEqual({
      tell: {
        character: {
          player: {
            _: "Suvorov"
          }
        }
      },
      raw: "Suvorov tells you 'alright'"
    });
    
    expect(plain).toBe("Suvorov tells you 'alright'");
  });

  test("should parse movement and room XML output to structured format", () => {
    const input = `<movement dir=west/><room id=9069590 area="Goblin-town" terrain=tunnel><name>East Fork</name>
A <character>hungry warg</character> stands here, sniffing around for flesh.
<exits from=9069590>Exits: <exit dir=east id=1904185>east</exit>, <exit dir=west id=4228336>west</exit>.
</exits></room>`;
    
    const { parsed, plain } = parseMudOutput(input);
    
    expect(parsed).toEqual({
      movement: {
        dir: "west"
      },
      room: {
        id: "9069590",
        area: "Goblin-town",
        terrain: "tunnel",
        name: "East Fork",
        exits: {
          east: "1904185",
          west: "4228336"
        }
      },
      raw: "East Fork\nA hungry warg stands here, sniffing around for flesh.\nExits: east, west."
    });
    
    expect(plain).toBe("East Fork\nA hungry warg stands here, sniffing around for flesh.\nExits: east, west.");
  });

  test("should parse character XML fragments to structured format", () => {
    const input = "<character><player>Azg the Tarkhnarb Orc</player></character> is standing here.\n<character><player>Azg the War Grinder</player></character> is in an excellent condition.";
    
    const { parsed, plain } = parseMudOutput(input);
    
    expect(parsed).toEqual({
      characters: [
        "Azg the Tarkhnarb Orc",
        "Azg the War Grinder"
      ],
      raw: "Azg the Tarkhnarb Orc is standing here.\nAzg the War Grinder is in an excellent condition."
    });
    
    expect(plain).toBe("Azg the Tarkhnarb Orc is standing here.\nAzg the War Grinder is in an excellent condition.");
  });

  test("should parse character XML fragments from mob examination", () => {
    const input = "A tall, dirty orc is standing in front of you, ready to store your stuff in his\nrotten cupboard. He will keep an eye on it, but don't trust too much in his\nhonesty.\nA <character>crouched orc</character> is in an excellent condition.";
    
    const { parsed, plain } = parseMudOutput(input);
    
    expect(parsed).toEqual({
      characters: [
        "crouched orc"
      ],
      raw: "A tall, dirty orc is standing in front of you, ready to store your stuff in his\nrotten cupboard. He will keep an eye on it, but don't trust too much in his\nhonesty.\nA crouched orc is in an excellent condition."
    });
    
    expect(plain).toBe("A tall, dirty orc is standing in front of you, ready to store your stuff in his\nrotten cupboard. He will keep an eye on it, but don't trust too much in his\nhonesty.\nA crouched orc is in an excellent condition.");
  });

  test("should parse group XML output to structured format", () => {
    const input = "<header>Group Member    Hits  Mana   Moves State Room</header>\n--------------------------------------------------------------------------\nAzg          <status>430</status>/<status>430</status> <status>63</status>/<status>63</status> <status>131</status>/<status>131</status>       In a Hidden Pit beneath Barad-dur";
    
    const { parsed, plain } = parseMudOutput(input);
    
    expect(parsed).toEqual({
      group: {
        "Azg": {
          hits: 430,
          mana: 63,
          moves: 131,
          room: "In a Hidden Pit beneath Barad-dur"
        }
      }
    });
    
    expect(plain).toBe("Group Member    Hits  Mana   Moves State Room\n--------------------------------------------------------------------------\nAzg          430/430 63/63 131/131       In a Hidden Pit beneath Barad-dur");
  });

  test("should decode HTML entities in prompt tags", () => {
    const input = "<prompt>oO CW&gt;</prompt>";
    
    const { parsed, plain } = parseMudOutput(input);
    
    expect(parsed).toEqual({
      prompt: {
        text: "oO CW>"
      },
      raw: "oO CW>"
    });
    
    expect(plain).toBe("oO CW>");
  });

  test("should parse allies output without creating character properties", () => {
    const input = "<header>Allies</header>\n-------\n      Prog Metal\n      Azg the War Grinder [Retired]\n [ A] Rogon Rogoff (Idle)\n\n3 allies on.\n130 players engaged in the war, with 19 recently active.\n\n<prompt>oO CW&gt;</prompt>";
    
    const { parsed, plain } = parseMudOutput(input);
    
    expect(parsed).toEqual({
      header: {
        text: "Allies"
      },
      prompt: {
        text: "oO CW>"
      },
      raw: "Allies\n-------\n      Prog Metal\n      Azg the War Grinder [Retired]\n [ A] Rogon Rogoff (Idle)\n\n3 allies on.\n130 players engaged in the war, with 19 recently active.\n\noO CW>"
    });
    
    expect(plain).toBe("Allies\n-------\n      Prog Metal\n      Azg the War Grinder [Retired]\n [ A] Rogon Rogoff (Idle)\n\n3 allies on.\n130 players engaged in the war, with 19 recently active.\n\noO CW>");
  });



  test("should handle simple XML elements", () => {
    const input = "<root>hello world</root>";
    const { parsed, plain } = parseMudOutput(input);
    
    expect(parsed).toEqual({
      root: {
        _: "hello world"
      },
      raw: "hello world"
    });
    expect(plain).toBe("hello world");
  });

  test("should handle self-closing tags", () => {
    const input = "<movement dir=south/>";
    const { parsed, plain } = parseMudOutput(input);
    
    expect(parsed).toEqual({
      movement: {
        dir: "south"
      },
      raw: ""
    });
    expect(plain).toBe("");
  });

  test("should handle mixed content with XML fragments", () => {
    const input = "Some text <tag>content</tag> more text <selfclosing/>";
    const { parsed, plain } = parseMudOutput(input);
    
    expect(parsed).toEqual({
      tag: {
        _: "content"
      },
      selfclosing: {},
      raw: "Some text content more text"
    });
    expect(plain).toBe("Some text content more text");
  });

  test("should handle invalid XML gracefully", () => {
    const input = "This is not XML at all";
    const { parsed, plain } = parseMudOutput(input);
    
    expect(parsed).toBeNull();
    expect(plain).toBe("This is not XML at all");
  });
}); 