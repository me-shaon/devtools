export function parseXml(input: string): XMLDocument {
  if (input.length > 1000000)
    throw new Error("XML is limited to 1 million characters.");
  // A DOCTYPE or ENTITY inside a comment or CDATA section is only text.
  const markup = input.replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>/g, "");
  if (/<!DOCTYPE|<!ENTITY/i.test(markup))
    throw new Error(
      "DTD and entity declarations are not supported. Remove them before inspecting XML.",
    );
  const document = new DOMParser().parseFromString(input, "application/xml");
  const error = document.querySelector("parsererror");
  if (error)
    // Browsers wrap the message in their own headings. The message is in the div.
    throw new Error(
      (error.querySelector("div") ?? error).textContent?.trim().slice(0, 500) ||
        "Invalid XML.",
    );
  return document;
}
export function inspectXml(
  input: string | XMLDocument,
  expression: string,
  namespaces: string,
): string {
  const document = typeof input === "string" ? parseXml(input) : input;
  if (!expression.trim())
    return new XMLSerializer().serializeToString(document);
  const mapping: Record<string, string> = Object.create(null);
  for (const line of namespaces.split(/\r?\n/).filter((x) => x.trim())) {
    const equal = line.indexOf("=");
    if (equal < 1 || !line.slice(equal + 1).trim())
      throw new Error("Namespaces must use prefix=URI, one per line.");
    mapping[line.slice(0, equal).trim()] = line.slice(equal + 1).trim();
  }
  const result = document.evaluate(
    expression,
    document,
    (prefix) =>
      mapping[prefix] ?? document.documentElement.lookupNamespaceURI(prefix),
    XPathResult.ANY_TYPE,
    null,
  );
  if (result.resultType === XPathResult.STRING_TYPE) return result.stringValue;
  if (result.resultType === XPathResult.NUMBER_TYPE)
    return String(result.numberValue);
  if (result.resultType === XPathResult.BOOLEAN_TYPE)
    return String(result.booleanValue);
  const nodes: string[] = [];
  let node: Node | null;
  while ((node = result.iterateNext())) {
    if (nodes.length >= 10000)
      throw new Error("More than 10,000 matches. Narrow your XPath query.");
    nodes.push(
      node.nodeType === Node.ATTRIBUTE_NODE || node.nodeType === Node.TEXT_NODE
        ? (node.nodeValue ?? "")
        : new XMLSerializer().serializeToString(node),
    );
  }
  return nodes.length ? nodes.join("\n") : "No matches";
}
