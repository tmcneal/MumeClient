import { parseStringPromise } from "xml2js";

// Regex to match ANSI escape codes
const ANSI_REGEX = /\x1b\[[0-9;]*m/g;
// Regex to match XML tags (greedy, matches self-closing and nested tags)
const XML_FRAGMENT_REGEX = /<([a-zA-Z0-9_:-]+)(\s[^>]*)?>[\s\S]*?<\/\1>|<([a-zA-Z0-9_:-]+)(\s[^>]*)?\/>/g;

export async function handleMudData(ws: any, text: string, xmlMode: boolean) {
  if (xmlMode) {
    // Extract XML fragments and plain text
    const xmls: any[] = [];
    const plain: string[] = [];
    let lastIndex = 0;
    let match;
    while ((match = XML_FRAGMENT_REGEX.exec(text)) !== null) {
      // Add any plain text before this XML fragment
      if (match.index > lastIndex) {
        const between = text.slice(lastIndex, match.index).trim();
        if (between) plain.push(between);
      }
      // Try to parse the XML fragment
      const xmlFragment = match[0];
      try {
        const parsed = await parseStringPromise(xmlFragment);
        xmls.push(parsed);
      } catch {
        plain.push(xmlFragment);
      }
      lastIndex = match.index + xmlFragment.length;
    }
    // Add any trailing plain text
    if (lastIndex < text.length) {
      const trailing = text.slice(lastIndex).trim();
      if (trailing) plain.push(trailing);
    }
    ws.send(JSON.stringify({ type: "mud", data: { xml: xmls, text: plain } }));
  } else {
    // Strip ANSI color codes, split on newlines, and send each line separately
    text.replace(ANSI_REGEX, "").split(/\r?\n/).forEach(line => {
      if (line.trim() !== "") {
        ws.send(JSON.stringify({ type: "mud", data: line }));
      }
    });
  }
} 