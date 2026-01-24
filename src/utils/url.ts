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
      params[decodeURIComponent(key)] = value ? decodeURIComponent(value) : '';
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
