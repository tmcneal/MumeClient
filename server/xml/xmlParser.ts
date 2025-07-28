import { parseDocument } from "htmlparser2";

// Regex to match XML tags (greedy, matches self-closing and nested tags)
const XML_FRAGMENT_REGEX = /<([a-zA-Z0-9_:-]+)(\s[^>]*)?>[\s\S]*?<\/\1>|<([a-zA-Z0-9_:-]+)(\s[^>]*)?\/>/g;
// Regex to strip all XML tags
const STRIP_XML_TAGS_REGEX = /<[^>]+>/g;

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

function transformToStructuredFormat(parsedNodes: any[]): any {
  if (parsedNodes.length === 0) return null;
  
  const result: any = {};
  
  for (const node of parsedNodes) {
    for (const [tagName, tagData] of Object.entries(node)) {
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
        // Add raw text at root level
        result.raw = extractRawText(room.children);
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
      } else {
        // For other tags, preserve the structure
        result[tagName] = tagData;
      }
    }
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
        status: {
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

function extractTextContent(children: any[], tagName: string): string | undefined {
  if (!children) return undefined;
  
  const nameNode = children.find((child: any) => child[tagName]);
  if (nameNode && nameNode[tagName]._) {
    return nameNode[tagName]._;
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
      rawText += child;
    } else if (child.name && child.name._) {
      rawText += child.name._;
    } else if (child.object && child.object._) {
      rawText += child.object._;
    } else if (child.character && child.character._) {
      rawText += child.character._;
    } else if (child.exits) {
      // Add exit text
      if (child.exits.children) {
        for (const exitChild of child.exits.children) {
          if (typeof exitChild === 'string') {
            rawText += exitChild;
          } else if (exitChild.exit && exitChild.exit._) {
            rawText += exitChild.exit._;
          }
        }
      }
    }
  }
  
  // Clean up extra whitespace and normalize newlines
  return rawText.replace(/\s+/g, ' ').trim();
}

export function parseXmlMessage(text: string): { parsed: any, plain: string } {
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
  
  // First try to parse as status fragments
  const statusResult = parseStatusFragments(parsed);
  if (statusResult) {
    return { parsed: statusResult, plain: text.replace(STRIP_XML_TAGS_REGEX, '').trim() };
  }
  
  // Transform to structured format
  const structured = transformToStructuredFormat(parsed);
  
  // Strip all XML tags for plain text output
  const plain = text.replace(STRIP_XML_TAGS_REGEX, '').trim();
  
  return { parsed: structured, plain };
} 