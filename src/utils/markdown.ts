export function convertMarkdown(markdown: string): string {
  let html = markdown;

  // Headers
  html = html.replace(/^### (.*$)/gim, "<h3>$1</h3>");
  html = html.replace(/^## (.*$)/gim, "<h2>$1</h2>");
  html = html.replace(/^# (.*$)/gim, "<h1>$1</h1>");

  // Bold and Italic
  html = html.replace(/\*\*\*(.*?)\*\*\*/gim, "<strong><em>$1</em></strong>");
  html = html.replace(/\*\*(.*?)\*\*/gim, "<strong>$1</strong>");
  html = html.replace(/\*(.*?)\*/gim, "<em>$1</em>");

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/gim, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Images
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/gim, '<img src="$2" alt="$1" />');

  // Code blocks
  html = html.replace(/```(\w+)?\n([\s\S]*?)```/gim, '<pre><code>$2</code></pre>');

  // Inline code
  html = html.replace(/`([^`]+)`/gim, "<code>$1</code>");

  // Blockquotes
  html = html.replace(/^> (.*$)/gim, "<blockquote>$1</blockquote>");

  // Unordered lists
  html = html.replace(/^\s*-\s+(.*$)/gim, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>)/s, "<ul>$1</ul>");

  // Ordered lists
  html = html.replace(/^\s*\d+\.\s+(.*$)/gim, "<li>$1</li>");

  // Horizontal rule
  html = html.replace(/^---$/gim, "<hr>");

  // Line breaks
  return html.replace(/\n/g, "<br>");
}
