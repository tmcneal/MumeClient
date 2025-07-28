import { parseDocument } from "htmlparser2";

// Regex to match XML tags for stripping
const STRIP_XML_TAGS_REGEX = /<[^>]*>/g;

// Regex to match XML fragments
const XML_FRAGMENT_REGEX = /<[^>]+>[^<]*<\/[^>]+>|<[^>]+\/>/g;

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

// Function to quote unquoted attributes in XML
function quoteUnquotedAttributes(xml: string): string {
  // Match attributes that are not quoted: attr=value
  return xml.replace(/(\w+)=([^"\s>\/]+)/g, '$1="$2"');
}

function nodeToJson(node: any): any {
  if (node.type === "text") return node.data.trim() ? node.data : undefined;
  if (node.type === "tag" || node.type === "script" || node.type === "style") {
    const obj: any = {};
    obj[node.name] = {};
    if (node.attribs && Object.keys(node.attribs).length > 0) obj[node.name].$ = node.attribs;
    if (node.children && node.children.length > 0) {
      const children = node.children.map(nodeToJson).filter(Boolean);
      if (children.length === 1 && typeof children[0] === "string") {
        obj[node.name]._ = children[0];
      } else if (children.length > 0) {
        obj[node.name].children = children;
      }
    }
    return obj;
  }
  return undefined;
}

function transformToStructuredFormat(parsedNodes: any[], originalText: string): any {
  if (parsedNodes.length === 0) return null;
  
  const result: any = {};
  
  for (const node of parsedNodes) {
    // Skip nodes that are just strings (plain text)
    if (typeof node === 'string') {
      continue;
    }
    
    for (const [tagName, tagData] of Object.entries(node)) {
      // Skip numeric keys (these are individual characters from plain text)
      if (!isNaN(Number(tagName))) {
        continue;
      }
      
      if (tagName === 'room') {
        const room = tagData as any;
        result.room = {
          // Extract attributes
          ...room.$,
          // Extract name if present
          name: extractTextContent(room.children, 'name'),
          // Extract exits if present
          exits: extractExits(room.children)
        };
        // Only set raw text if this is the only element (not mixed with other elements)
        if (Object.keys(result).length === 1) {
          result.raw = extractRawText(room.children);
        }
      } else if (tagName === 'movement') {
        const movement = tagData as any;
        result.movement = {
          ...movement.$
        };
      } else if (tagName === 'prompt') {
        const prompt = tagData as any;
        result.prompt = {
          text: prompt._
        };
      } else if (tagName === 'header') {
        const header = tagData as any;
        result.header = {
          text: header._
        };
      } else {
        // For other tags, create a clean structure without plain text children
        const cleanTagData = cleanMixedContent(tagData as any);
        result[tagName] = cleanTagData;
      }
    }
  }
  
  // If we have structured content but no raw text, generate it from the original text
  if (Object.keys(result).length > 0 && !result.raw) {
    // Remove the XML tags to get the raw text, but preserve newlines and indentation
    const strippedText = originalText.replace(STRIP_XML_TAGS_REGEX, '').trim();
    // Clean up extra whitespace but preserve newlines, indentation, and double newlines
    result.raw = decodeHtmlEntities(strippedText);
  }
  
  return result;
}

function cleanMixedContent(tagData: any): any {
  if (!tagData) return tagData;
  
  // If it has a direct text value, preserve the structure for simple cases
  if (tagData._ && (!tagData.children || tagData.children.length === 0)) {
    return tagData;
  }
  
  // If it has attributes, preserve them
  const result: any = {};
  if (tagData.$) {
    result.$ = tagData.$;
  }
  
  // Process children, but only include XML elements (skip plain text)
  if (tagData.children && Array.isArray(tagData.children)) {
    const cleanChildren: any = {};
    
    for (const child of tagData.children) {
      // Skip plain text children
      if (typeof child === 'string') {
        continue;
      }
      
      // Process each child tag
      for (const [childTagName, childTagData] of Object.entries(child)) {
        // Skip numeric keys (plain text characters)
        if (!isNaN(Number(childTagName))) {
          continue;
        }
        
        // Recursively clean the child content
        cleanChildren[childTagName] = cleanMixedContent(childTagData as any);
      }
    }
    
    // Only add children if we have any
    if (Object.keys(cleanChildren).length > 0) {
      Object.assign(result, cleanChildren);
    }
  }
  
  // If we have no children but have text content, preserve it
  if (tagData._ && Object.keys(result).length === 0) {
    result._ = tagData._;
  }
  
  return result;
}

function parseStatusFragments(parsedNodes: any[]): any {
  if (parsedNodes.length === 0) return null;
  
  // Check if this looks like a status pattern (multiple status tags with numbers)
  const statusNodes = parsedNodes.filter(node => node.status);
  if (statusNodes.length >= 6) { // At least 6 status tags for hits/max, mana/max, moves/max
    const statusValues: number[] = [];
    
    // Extract all status values
    for (const node of statusNodes) {
      if (node.status && node.status._) {
        const value = parseInt(node.status._, 10);
        if (!isNaN(value)) {
          statusValues.push(value);
        }
      }
    }
    
    // Check if we have the expected pattern (6 values: current/max for hits, mana, moves)
    if (statusValues.length >= 6) {
      const result: any = {
        score: {
          hits: {
            current: statusValues[0],
            max: statusValues[1]
          },
          mana: {
            current: statusValues[2],
            max: statusValues[3]
          },
          moves: {
            current: statusValues[4],
            max: statusValues[5]
          }
        },
        raw: `${statusValues[0]}/${statusValues[1]} hits, ${statusValues[2]}/${statusValues[3]} mana, and ${statusValues[4]}/${statusValues[5]} moves.`
      };
      
      return result;
    }
  }
  
  return null;
}

function parseCharacterFragments(parsedNodes: any[], originalText: string): any {
  if (parsedNodes.length === 0) return null;
  
  // Check if this looks like a character pattern (multiple character tags with player names)
  // Also check for direct player nodes (when character tags are parsed as fragments)
  const characterNodes = parsedNodes.filter(node => node.character);
  const playerNodes = parsedNodes.filter(node => node.player);
  
  if (characterNodes.length >= 1 || playerNodes.length >= 1) {
    const characters: string[] = [];
    
    // Extract all character names from character nodes
    for (const node of characterNodes) {
      if (node.character) {
        // Handle nested player tags in children
        let fullName = '';
        if (node.character.children && node.character.children.length > 0) {
          const firstChild = node.character.children[0];
          if (firstChild.player && firstChild.player._) {
            fullName = firstChild.player._;
          }
        } else if (node.character.player && node.character.player._) {
          fullName = node.character.player._;
        } else if (node.character._) {
          fullName = node.character._;
        }
        
        if (fullName) {
          characters.push(decodeHtmlEntities(fullName));
        }
      }
    }
    
    // Extract all character names from direct player nodes
    for (const node of playerNodes) {
      if (node.player && node.player._) {
        const fullName = node.player._;
        characters.push(decodeHtmlEntities(fullName));
      }
    }
    
    // If we found characters, return the structured format
    if (characters.length > 0) {
      // Generate raw text by replacing character tags with just the names
      let rawText = originalText;
      
      // Replace character tags with player names
      for (const node of characterNodes) {
        if (node.character && node.character.children && node.character.children.length > 0) {
          const firstChild = node.character.children[0];
          if (firstChild.player && firstChild.player._) {
            const fullName = firstChild.player._;
            // Replace the entire character tag with just the name
            const characterTag = `<character><player>${fullName}</player></character>`;
            rawText = rawText.replace(characterTag, decodeHtmlEntities(fullName));
          }
        } else if (node.character && node.character._) {
          const fullName = node.character._;
          // Replace the entire character tag with just the name
          const characterTag = `<character>${fullName}</character>`;
          rawText = rawText.replace(characterTag, decodeHtmlEntities(fullName));
        }
      }
      
      // Also handle direct player nodes
      for (const node of playerNodes) {
        if (node.player && node.player._) {
          const fullName = node.player._;
          // Replace the entire character tag with just the name
          const characterTag = `<character><player>${fullName}</player></character>`;
          rawText = rawText.replace(characterTag, decodeHtmlEntities(fullName));
        }
      }
      
      const result: any = {
        characters,
        raw: rawText
      };
      
      return result;
    }
  }
  
  return null;
}

function parseGroupOutput(parsedNodes: any[], originalText: string): any {
  if (parsedNodes.length === 0) return null;
  
  // Check if this looks like a group output (has header with "Group Member")
  const headerNodes = parsedNodes.filter(node => node.header);
  if (headerNodes.length > 0) {
    const headerNode = headerNodes[0];
    if (headerNode.header && headerNode.header._ && headerNode.header._.includes('Group Member')) {
      // This is a group output, parse the group member information
      const group: any = {};
      
      // Extract status values from the text
      const statusMatches = originalText.match(/<status>(\d+)<\/status>/g);
      if (statusMatches) {
        const statusValues = statusMatches.map(match => {
          const value = match.replace(/<\/?status>/g, '');
          return parseInt(value, 10);
        });
        
                 // Parse the text to extract member name and room
         const lines = originalText.split('\n');
         if (lines.length >= 3) {
           // Skip header and separator lines, parse the member line
           const memberLine = lines[2];
           
           if (memberLine) {
             // Extract member name (first word before the status tags)
             const nameMatch = memberLine.match(/^(\S+)\s+/);
             if (nameMatch) {
               const memberName = nameMatch[1];
               
               // Extract room name (everything after the status tags)
               const roomMatch = memberLine.match(/<status>\d+<\/status>\/<status>\d+<\/status>\s+<status>\d+<\/status>\/<status>\d+<\/status>\s+<status>\d+<\/status>\/<status>\d+<\/status>\s+(.+)$/);
               if (roomMatch && statusValues.length >= 6) {
                 const room = (roomMatch[1] as string).trim();
                 
                 group[memberName as string] = {
                   hits: statusValues[0], // First status value is current hits
                   mana: statusValues[2], // Third status value is current mana
                   moves: statusValues[4], // Fifth status value is current moves
                   room: room
                 };
                 
                 return { group };
               }
             }
           }
         }
      }
    }
  }
  
  return null;
}

function parseStatsFragments(parsedNodes: any[], originalText: string): any {
  if (parsedNodes.length === 0) return null;
  
  // Check if this looks like a stats pattern (multiple status tags with various stats)
  const statusNodes = parsedNodes.filter(node => node.status);
  if (statusNodes.length >= 10) { // At least 10 status tags for various stats
    const statusValues: (number | string)[] = [];
    
    // Extract all status values
    for (const node of statusNodes) {
      if (node.status && node.status._) {
        const value = node.status._;
        // Try to parse as number first, fall back to string
        const numValue = parseInt(value.replace(/,/g, ''), 10);
        if (!isNaN(numValue)) {
          statusValues.push(numValue);
        } else {
          statusValues.push(value);
        }
      }
    }
    
    // Check if we have enough values for stats
    if (statusValues.length >= 10) {
      const result: any = {
        stats: {
          ob: statusValues[0] as number,
          db: statusValues[1] as number,
          pb: statusValues[2] as number,
          armour: statusValues[3] as number,
          wimpy: statusValues[4] as number,
          mood: statusValues[5] as string,
          xp: statusValues[6] as number,
          tp: statusValues[7] as number,
          gold: statusValues[8] as number,
          alert: statusValues[9] as string
        },
        raw: decodeHtmlEntities(originalText.replace(STRIP_XML_TAGS_REGEX, '').trim())
      };
      
      return result;
    }
  }
  
  return null;
}

function parseHitFragments(parsedNodes: any[], originalText: string): any {
  if (parsedNodes.length === 0) return null;
  
  // Check if this looks like a hit pattern (hit tag with nested character)
  const hitNodes = parsedNodes.filter(node => node.hit);
  if (hitNodes.length >= 1) {
    const hitNode = hitNodes[0];
    if (hitNode.hit && hitNode.hit.children) {
      // Look for nested character tag
      for (const child of hitNode.hit.children) {
        if (child.character && child.character._) {
          const target = decodeHtmlEntities(child.character._);
          
          const result: any = {
            hit: {
              target: target
            },
            raw: decodeHtmlEntities(originalText.replace(STRIP_XML_TAGS_REGEX, '').trim())
          };
          
          return result;
        }
      }
    }
  }
  
  return null;
}

function parseDamageFragments(parsedNodes: any[], originalText: string): any {
  if (parsedNodes.length === 0) return null;
  
  // Check if this looks like a damage pattern (damage tag with nested character)
  const damageNodes = parsedNodes.filter(node => node.damage);
  if (damageNodes.length >= 1) {
    const damageNode = damageNodes[0];
    if (damageNode.damage && damageNode.damage.children) {
      // Look for nested character tag
      for (const child of damageNode.damage.children) {
        if (child.character && child.character._) {
          const source = decodeHtmlEntities(child.character._);
          
          const result: any = {
            damage: {
              source: source
            },
            raw: decodeHtmlEntities(originalText.replace(STRIP_XML_TAGS_REGEX, '').trim())
          };
          
          return result;
        }
      }
    }
  }
  
  return null;
}

function extractTextContent(children: any[], tagName: string): string | undefined {
  if (!children) return undefined;
  
  const nameNode = children.find((child: any) => child[tagName]);
  if (nameNode && nameNode[tagName]._) {
    return decodeHtmlEntities(nameNode[tagName]._);
  }
  return undefined;
}

function extractExits(children: any[]): any {
  if (!children) return {};
  
  const exitsNode = children.find((child: any) => child.exits);
  if (!exitsNode || !exitsNode.exits.children) return {};
  
  const exits: any = {};
  const exitNodes = exitsNode.exits.children.filter((child: any) => child.exit);
  
  for (const exitNode of exitNodes) {
    const exit = exitNode.exit;
    if (exit.$ && exit.$.dir && exit.$.id) {
      exits[exit.$.dir] = exit.$.id;
    }
  }
  
  return exits;
}

function extractRawText(children: any[]): string {
  if (!children) return '';
  
  let rawText = '';
  for (const child of children) {
    if (typeof child === 'string') {
      rawText += decodeHtmlEntities(child);
    } else if (child.name && child.name._) {
      rawText += decodeHtmlEntities(child.name._);
    } else if (child.object && child.object._) {
      rawText += decodeHtmlEntities(child.object._);
    } else if (child.character && child.character._) {
      rawText += decodeHtmlEntities(child.character._);
    } else if (child.exits) {
      // Add exit text
      if (child.exits.children) {
        for (const exitChild of child.exits.children) {
          if (typeof exitChild === 'string') {
            rawText += decodeHtmlEntities(exitChild);
          } else if (exitChild.exit && exitChild.exit._) {
            rawText += decodeHtmlEntities(exitChild.exit._);
          }
        }
      }
    }
  }
  
  // Clean up extra whitespace and normalize newlines
  return rawText.replace(/\s+/g, ' ').trim();
}

export function parseMudOutput(text: string): { parsed: any, plain: string } {
  // Preprocess XML to quote unquoted attributes
  const processedText = quoteUnquotedAttributes(text);
  
  // Try to parse the whole block as XML using htmlparser2
  let parsed: any[] = [];
  if (processedText.trim().startsWith("<") && processedText.trim().endsWith(">")) {
    try {
      const doc = parseDocument(processedText, { xmlMode: true, recognizeSelfClosing: true });
      parsed = doc.children.map(nodeToJson).filter(Boolean);
    } catch (e) {
      // Fallback to fragment parsing below
    }
  }
  
  // Fallback: fragment parsing
  if (parsed.length === 0) {
    const xmls: any[] = [];
    let lastIndex = 0;
    let match;
    while ((match = XML_FRAGMENT_REGEX.exec(processedText)) !== null) {
      const xmlFragment = match[0];
      try {
        const doc = parseDocument(xmlFragment, { xmlMode: true, recognizeSelfClosing: true });
        const fragParsed = doc.children.map(nodeToJson).filter(Boolean);
        xmls.push(...fragParsed);
      } catch {
        // ignore
      }
      lastIndex = match.index + xmlFragment.length;
    }
    parsed = xmls;
  }
  
  // First try to parse as group output (before status fragments since group contains status tags)
  const groupResult = parseGroupOutput(parsed, text);
  if (groupResult) {
    return { parsed: groupResult, plain: decodeHtmlEntities(text.replace(STRIP_XML_TAGS_REGEX, '').trim()) };
  }

  // Then try to parse as stats fragments (before status fragments since stats contains more status tags)
  const statsResult = parseStatsFragments(parsed, text);
  if (statsResult) {
    return { parsed: statsResult, plain: decodeHtmlEntities(text.replace(STRIP_XML_TAGS_REGEX, '').trim()) };
  }

  // Then try to parse as status fragments
  const statusResult = parseStatusFragments(parsed);
  if (statusResult) {
    return { parsed: statusResult, plain: decodeHtmlEntities(text.replace(STRIP_XML_TAGS_REGEX, '').trim()) };
  }

  // Then try to parse as character fragments
  const characterResult = parseCharacterFragments(parsed, text);
  if (characterResult) {
    return { parsed: characterResult, plain: decodeHtmlEntities(text.replace(STRIP_XML_TAGS_REGEX, '').trim()) };
  }

  // Then try to parse as hit fragments
  const hitResult = parseHitFragments(parsed, text);
  if (hitResult) {
    return { parsed: hitResult, plain: decodeHtmlEntities(text.replace(STRIP_XML_TAGS_REGEX, '').trim()) };
  }

  // Then try to parse as damage fragments
  const damageResult = parseDamageFragments(parsed, text);
  if (damageResult) {
    return { parsed: damageResult, plain: decodeHtmlEntities(text.replace(STRIP_XML_TAGS_REGEX, '').trim()) };
  }
  
  // Transform to structured format
  const structured = transformToStructuredFormat(parsed, text);
  
  // Strip all XML tags for plain text output and decode HTML entities
  const plain = decodeHtmlEntities(text.replace(STRIP_XML_TAGS_REGEX, '').trim());
  
  return { parsed: structured, plain };
} 