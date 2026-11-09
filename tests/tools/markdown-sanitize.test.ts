import { describe, it, expect } from 'vitest';
import { convertMarkdown, countRemoteImages, sanitizeHtml } from '@/utils/markdown';

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
    expect(html).toContain('<code>code</code>');
    expect(html.replace(/\n/g, '')).toContain('<ul><li>one</li><li>two</li></ul>');
  });

  it('removes tags that could restyle the app, load documents, or take input', () => {
    const html = render('<style>body{display:none}</style>\n\n<form><input type="text"><button>Go</button></form>\n\n<iframe src="https://x.example"></iframe><object data="x"></object><link rel="stylesheet" href="x.css">');
    expect(html).not.toMatch(/<(style|form|input|button|iframe|object|link)\b/i);
  });
});

describe('markdown with HTML', () => {
  it('renders an HTML block over several lines, with Markdown inside after a blank line', () => {
    const html = render('<details>\n<summary>More</summary>\n\nHidden **text**\n\n</details>');
    expect(html).toContain('<details>');
    expect(html).toContain('<summary>More</summary>');
    expect(html).toContain('<strong>text</strong>');
    expect(html).not.toContain('<br>');
  });

  it('keeps the align attribute and image sizes', () => {
    const html = render('<p align="center">\n  <img src="logo.png" width="120" height="40" alt="Logo">\n</p>');
    expect(html).toContain('align="center"');
    expect(html).toContain('width="120"');
    expect(html).toContain('height="40"');
  });

  it('keeps inline tags such as kbd, sub, sup, and mark', () => {
    const html = render('Press <kbd>Ctrl</kbd>, H<sub>2</sub>O, x<sup>2</sup>, <mark>note</mark>');
    expect(html).toContain('<kbd>Ctrl</kbd>');
    expect(html).toContain('<sub>2</sub>');
    expect(html).toContain('<sup>2</sup>');
    expect(html).toContain('<mark>note</mark>');
  });

  it('shows HTML in code blocks and inline code as text', () => {
    const block = render('```html\n<div class="x">hi</div>\n```');
    expect(block).toContain('&lt;div class="x"&gt;hi&lt;/div&gt;');
    expect(block).not.toContain('<div class="x">');
    expect(render('Use `<br>` tags')).toContain('<code>&lt;br&gt;</code>');
  });
});

describe('GitHub Flavored Markdown', () => {
  it('renders tables with alignment', () => {
    const html = render('| a | b |\n|---|:-:|\n| 1 | 2 |');
    expect(html).toContain('<table>');
    expect(html).toMatch(/<th>a<\/th>/);
    expect(html).toMatch(/<td align="center">2<\/td>/);
  });

  it('renders task lists with disabled checkboxes', () => {
    const html = render('- [x] done\n- [ ] todo');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const boxes = Array.from(doc.querySelectorAll('input'));
    expect(boxes.map((box) => [box.type, box.checked, box.disabled])).toEqual([
      ['checkbox', true, true],
      ['checkbox', false, true],
    ]);
  });

  it('renders strikethrough and autolinks', () => {
    const html = render('~~old~~ https://example.com');
    expect(html).toContain('<del>old</del>');
    expect(html).toContain('href="https://example.com"');
  });
});

describe('countRemoteImages', () => {
  it('counts images, sources, posters, and CSS urls that load from the network', () => {
    const html = sanitizeHtml(
      '<img src="https://a.example/1.png"><img src="//b.example/2.png"><img src="local.png"><img src="data:image/png;base64,AA==">' +
        '<picture><source srcset="https://c.example/3.webp 2x"></picture><video poster="http://d.example/4.jpg"></video>' +
        '<span style="background: url(\'https://e.example/5.png\')">x</span>',
    );
    expect(countRemoteImages(html)).toBe(5);
    expect(countRemoteImages('<p>none</p>')).toBe(0);
  });
});
