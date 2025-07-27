import { parseDocument } from "htmlparser2";

// Regex to match XML tags (greedy, matches self-closing and nested tags)
const XML_FRAGMENT_REGEX = /<([a-zA-Z0-9_:-]+)(\s[^>]*)?>[\s\S]*?<\/\1>|<([a-zA-Z0-9_:-]+)(\s[^>]*)?\/>/g;
// Regex to strip all XML tags
const STRIP_XML_TAGS_REGEX = /<[^>]+>/g;

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

export function parseXmlMessage(text: string): { parsed: any[], plain: string } {
  // Try to parse the whole block as XML using htmlparser2
  let parsed: any[] = [];
  if (text.trim().startsWith("<") && text.trim().endsWith(">")) {
    try {
      const doc = parseDocument(text, { xmlMode: true, recognizeSelfClosing: true });
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
    while ((match = XML_FRAGMENT_REGEX.exec(text)) !== null) {
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
  
  // Strip all XML tags for plain text output
  const plain = text.replace(STRIP_XML_TAGS_REGEX, '').trim();
  
  return { parsed, plain };
} 