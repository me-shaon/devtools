import { describe, it, expect } from 'vitest';
import { convertMarkdown, sanitizeHtml } from '@/utils/markdown';

const render = (md: string) => sanitizeHtml(convertMarkdown(md));

describe('markdown sanitizing', () => {
  it('removes event handler attributes', () => {
    const html = render('<img src=x onerror=alert(1)>');
    expect(html).not.toMatch(/onerror/i);
  });

  it('removes javascript: URLs from links', () => {
    const html = render('[x](javascript:alert(1))');
    expect(html).not.toMatch(/javascript:/i);
  });

  it('removes script tags', () => {
    const html = render('hi <script>alert(1)</script> there');
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toContain('alert(1)');
  });

  it('keeps normal markup', () => {
    const html = render('# Title\n\n**bold** [site](https://example.com) `code`\n\n- one\n- two');
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener"');
    expect(html).toContain('<code>code</code>');
    expect(html).toContain('<ul><li>one</li><li>two</li></ul>');
  });
});
