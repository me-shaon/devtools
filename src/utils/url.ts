/**
 * URL Encoder/Decoder utility functions
 */

export interface UrlEncodeOptions {
  component?: boolean; // Use encodeURIComponent vs encodeURI
  form?: boolean; // Use application/x-www-form-urlencoded format
}

/**
 * Encode a string for use in URLs
 */
export function encodeUrl(input: string, options: UrlEncodeOptions = {}): string {
  const { component = false, form = false } = options;

  if (form) {
    // For form data, encode spaces as + and use encodeURIComponent
    return encodeURIComponent(input).replace(/%20/g, '+');
  }

  if (component) {
    return encodeURIComponent(input);
  }

  return encodeURI(input);
}

/**
 * Decode a URL-encoded string
 */
export function decodeUrl(input: string, options: UrlEncodeOptions = {}): string {
  const { component = false, form = false } = options;

  if (form) {
    // For form data, convert + back to spaces before decoding
    const withSpaces = input.replace(/\+/g, ' ');
    return decodeURIComponent(withSpaces);
  }

  if (component) {
    return decodeURIComponent(input);
  }

  return decodeURI(input);
}

/**
 * Encode all parameters in a URL query string
 */
export function encodeQueryParams(params: Record<string, string | number | boolean>): string {
  const pairs = Object.entries(params).map(([key, value]) => {
    const encodedKey = encodeURIComponent(key);
    const encodedValue = encodeURIComponent(String(value));
    return `${encodedKey}=${encodedValue}`;
  });
  return pairs.join('&');
}

/**
 * Decode a percent-encoded string. Return the input unchanged if it is malformed.
 */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export interface QueryPair {
  key: string;
  value: string;
}

/**
 * Parse a query string into an ordered list of pairs. Repeated keys are kept.
 * A "+" is read as a space (form encoding).
 */
export function parseQueryPairs(queryString: string): QueryPair[] {
  const str = queryString.replace(/^\?/, '');
  if (!str) return [];
  const pairs: QueryPair[] = [];
  for (const part of str.split('&')) {
    if (!part) continue;
    const index = part.indexOf('=');
    const rawKey = index === -1 ? part : part.slice(0, index);
    const rawValue = index === -1 ? '' : part.slice(index + 1);
    pairs.push({
      key: safeDecode(rawKey.replace(/\+/g, ' ')),
      value: safeDecode(rawValue.replace(/\+/g, ' ')),
    });
  }
  return pairs;
}

/**
 * Build a query string (without "?") from an ordered list of pairs.
 * Pairs with an empty key are skipped.
 */
export function buildQueryString(pairs: QueryPair[]): string {
  return pairs
    .filter((pair) => pair.key !== '')
    .map((pair) => `${encodeURIComponent(pair.key)}=${encodeURIComponent(pair.value)}`)
    .join('&');
}

export interface ParsedUrlDetails {
  protocol: string;
  username: string;
  password: string;
  hostname: string;
  port: string;
  pathname: string;
  hash: string;
  params: QueryPair[];
}

export type ParseUrlResult =
  | { ok: true; value: ParsedUrlDetails }
  | { ok: false; error: string };

/**
 * Parse an absolute URL into parts. Return an error message for invalid input.
 */
export function parseUrlDetails(input: string): ParseUrlResult {
  const text = input.trim();
  if (!text) return { ok: false, error: 'Enter a URL to parse.' };
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    return { ok: false, error: 'Invalid URL. Include a protocol, for example https://example.com.' };
  }
  return {
    ok: true,
    value: {
      protocol: parsed.protocol.replace(/:$/, ''),
      username: safeDecode(parsed.username),
      password: safeDecode(parsed.password),
      hostname: parsed.hostname,
      port: parsed.port,
      pathname: parsed.pathname,
      hash: parsed.hash.replace(/^#/, ''),
      params: parseQueryPairs(parsed.search),
    },
  };
}

/**
 * Rebuild a URL string from parsed details (use after the parameters are edited).
 */
export function buildUrlFromDetails(details: ParsedUrlDetails): string {
  let url = `${details.protocol}:`;
  const hasHost = details.hostname !== '';
  if (hasHost) {
    url += '//';
    if (details.username) {
      url += encodeURIComponent(details.username);
      if (details.password) url += ':' + encodeURIComponent(details.password);
      url += '@';
    }
    url += details.hostname.includes(':') && !details.hostname.startsWith('[')
      ? `[${details.hostname}]`
      : details.hostname;
    if (details.port) url += ':' + details.port;
  }
  if (details.pathname) {
    url += hasHost && !details.pathname.startsWith('/') ? '/' + details.pathname : details.pathname;
  }
  const query = buildQueryString(details.params);
  if (query) url += '?' + query;
  if (details.hash) url += '#' + details.hash;
  return url;
}

/**
 * Parse a URL query string into an object
 */
export function parseQueryString(queryString: string): Record<string, string> {
  const params: Record<string, string> = {};

  if (!queryString) {
    return params;
  }

  // Remove leading ? if present
  const str = queryString.startsWith('?') ? queryString.slice(1) : queryString;

  str.split('&').forEach((pair) => {
    if (!pair) return;
    const [key, ...valueParts] = pair.split('=');
    const value = valueParts.join('=');
    if (key) {
      params[safeDecode(key)] = value ? safeDecode(value) : '';
    }
  });

  return params;
}

/**
 * Parse a complete URL into its components
 */
export function parseUrl(url: string): {
  protocol?: string;
  hostname?: string;
  port?: string;
  pathname?: string;
  search?: string;
  hash?: string;
} {
  try {
    const parsed = new URL(url);
    return {
      protocol: parsed.protocol.replace(/:$/, ''),
      hostname: parsed.hostname,
      port: parsed.port,
      pathname: parsed.pathname,
      search: parsed.search.replace(/^\?/, ''),
      hash: parsed.hash.replace(/^#/, ''),
    };
  } catch {
    // Fallback for relative URLs or invalid URLs
    return {};
  }
}

/**
 * Build a URL from components
 */
export function buildUrl(parts: {
  protocol?: string;
  hostname?: string;
  port?: string;
  pathname?: string;
  search?: string | Record<string, string | number | boolean>;
  hash?: string;
}): string {
  let url = '';

  if (parts.protocol) {
    url += parts.protocol + '://';
  }

  if (parts.hostname) {
    url += parts.hostname;
  }

  if (parts.port) {
    url += ':' + parts.port;
  }

  if (parts.pathname) {
    url += parts.pathname.startsWith('/') ? parts.pathname : '/' + parts.pathname;
  }

  if (parts.search) {
    if (typeof parts.search === 'string') {
      url += parts.search.startsWith('?') ? parts.search : '?' + parts.search;
    } else {
      url += '?' + encodeQueryParams(parts.search);
    }
  }

  if (parts.hash) {
    url += parts.hash.startsWith('#') ? parts.hash : '#' + parts.hash;
  }

  return url;
}
