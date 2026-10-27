/**
 * Tests for JWT signing and verification with asymmetric keys, and for time claims.
 */

import { describe, expect, it } from 'vitest';
import {
  JWT_ALGORITHMS,
  decodeJwt,
  derivePublicKey,
  describeTimeClaims,
  formatRelativeTime,
  generateJwtKeyPair,
  refreshTimeClaims,
  setHeaderAlgorithm,
  signJwt,
  verifyJwtSignature,
} from '@/utils/jwt';
import { loadX509 } from '@/utils/certificate';

const b64url = (input: string | Uint8Array) =>
  Buffer.from(typeof input === 'string' ? new TextEncoder().encode(input) : input).toString('base64url');

const toPem = (label: string, der: ArrayBuffer | Uint8Array) => {
  const body = Buffer.from(der instanceof Uint8Array ? der : new Uint8Array(der)).toString('base64');
  return `-----BEGIN ${label}-----\n${body.match(/.{1,64}/g)!.join('\n')}\n-----END ${label}-----`;
};

/** Reads the TLV at `offset` and returns where its content starts and ends. */
const tlv = (bytes: Uint8Array, offset: number) => {
  let length = bytes[offset + 1];
  let start = offset + 2;
  if (length & 0x80) {
    const count = length & 0x7f;
    length = 0;
    for (let i = 0; i < count; i++) length = (length << 8) | bytes[start + i];
    start += count;
  }
  return { start, end: start + length };
};

/** PKCS#8 wraps the PKCS#1 or SEC1 key in its last OCTET STRING. Return that inner key. */
const innerKey = (pkcs8: ArrayBuffer) => {
  const bytes = new Uint8Array(pkcs8);
  const outer = tlv(bytes, 0);
  let offset = outer.start;
  let last = { start: 0, end: 0 };
  while (offset < outer.end) {
    last = tlv(bytes, offset);
    offset = last.end;
  }
  return bytes.slice(last.start, last.end);
};

const ASYMMETRIC = ['RS256', 'RS384', 'RS512', 'PS256', 'PS384', 'PS512', 'ES256', 'ES384', 'ES512', 'EdDSA'] as const;

describe('asymmetric signing and verification', () => {
  it.each(ASYMMETRIC)('signs and verifies %s with PEM keys', async (alg) => {
    const { privateKeyPem, publicKeyPem } = await generateJwtKeyPair(alg);
    expect(privateKeyPem).toMatch(/^-----BEGIN PRIVATE KEY-----/);
    expect(publicKeyPem).toMatch(/^-----BEGIN PUBLIC KEY-----/);

    const token = await signJwt({ alg, typ: 'JWT' }, { sub: 'abc' }, privateKeyPem);
    expect(decodeJwt(token).header.alg).toBe(alg);
    expect(await verifyJwtSignature(token, publicKeyPem)).toMatchObject({ status: 'valid' });

    const [h, , s] = token.split('.');
    const tampered = `${h}.${b64url(JSON.stringify({ sub: 'xyz' }))}.${s}`;
    expect((await verifyJwtSignature(tampered, publicKeyPem)).status).toBe('invalid');

    const other = await generateJwtKeyPair(alg);
    expect((await verifyJwtSignature(token, other.publicKeyPem)).status).toBe('invalid');
  }, 30000);

  it('verifies with a public JWK and with the private key', async () => {
    const { privateKeyPem } = await generateJwtKeyPair('ES256');
    const token = await signJwt({ alg: 'ES256' }, { a: 1 }, privateKeyPem);
    const { jwk, pem } = await derivePublicKey('ES256', privateKeyPem);
    expect(jwk).toMatchObject({ kty: 'EC', crv: 'P-256' });
    expect(jwk).not.toHaveProperty('d');
    expect((await verifyJwtSignature(token, JSON.stringify(jwk))).status).toBe('valid');
    expect((await verifyJwtSignature(token, pem)).status).toBe('valid');
    expect((await verifyJwtSignature(token, privateKeyPem)).status).toBe('valid');
  });

  it('picks the key from a JWKS by kid', async () => {
    const a = await generateJwtKeyPair('RS256');
    const b = await generateJwtKeyPair('RS256');
    const jwkA = { ...(await derivePublicKey('RS256', a.privateKeyPem)).jwk, kid: 'a' };
    const jwkB = { ...(await derivePublicKey('RS256', b.privateKeyPem)).jwk, kid: 'b' };
    const jwks = JSON.stringify({ keys: [jwkA, jwkB] });

    const token = await signJwt({ alg: 'RS256', kid: 'b' }, { a: 1 }, b.privateKeyPem);
    expect(await verifyJwtSignature(token, jwks)).toEqual({ status: 'valid', message: 'Signature valid (kid "b")' });

    const missing = await signJwt({ alg: 'RS256', kid: 'c' }, { a: 1 }, b.privateKeyPem);
    expect(await verifyJwtSignature(missing, jwks)).toEqual({
      status: 'error',
      message: 'No key in the JWKS has kid "c".',
    });

    // Without a kid, every key that fits the algorithm is tried.
    const noKid = await signJwt({ alg: 'RS256' }, { a: 1 }, b.privateKeyPem);
    expect(await verifyJwtSignature(noKid, jwks)).toEqual({ status: 'valid', message: 'Signature valid (kid "b")' });
  }, 30000);

  it('accepts PKCS#1 RSA keys and SEC1 EC keys', async () => {
    const rsa = await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['sign', 'verify']
    );
    const rsaPkcs1 = toPem('RSA PRIVATE KEY', innerKey(await crypto.subtle.exportKey('pkcs8', rsa.privateKey)));
    const rsaToken = await signJwt({ alg: 'RS256' }, { a: 1 }, rsaPkcs1);
    const spki = new Uint8Array(await crypto.subtle.exportKey('spki', rsa.publicKey));
    // SPKI ends with a BIT STRING whose content is 0x00 then the PKCS#1 public key.
    const outer = tlv(spki, 0);
    const algId = tlv(spki, outer.start);
    const bitString = tlv(spki, algId.end);
    const rsaPublicPkcs1 = toPem('RSA PUBLIC KEY', spki.slice(bitString.start + 1, bitString.end));
    expect((await verifyJwtSignature(rsaToken, rsaPublicPkcs1)).status).toBe('valid');

    for (const [alg, namedCurve] of [['ES256', 'P-256'], ['ES384', 'P-384'], ['ES512', 'P-521']] as const) {
      const ec = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve }, true, ['sign', 'verify']);
      const sec1 = toPem('EC PRIVATE KEY', innerKey(await crypto.subtle.exportKey('pkcs8', ec.privateKey)));
      const token = await signJwt({ alg }, { a: 1 }, sec1);
      const publicPem = toPem('PUBLIC KEY', await crypto.subtle.exportKey('spki', ec.publicKey));
      expect((await verifyJwtSignature(token, publicPem)).status).toBe('valid');
    }
  }, 30000);

  it('verifies with an X.509 certificate', async () => {
    const x509 = await loadX509();
    const EC = { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' };
    const keys = (await crypto.subtle.generateKey(EC, true, ['sign', 'verify'])) as CryptoKeyPair;
    const cert = await x509.X509CertificateGenerator.createSelfSigned({
      serialNumber: '01',
      name: 'CN=issuer.example',
      notBefore: new Date(Date.now() - 86_400_000),
      notAfter: new Date(Date.now() + 86_400_000),
      signingAlgorithm: EC,
      keys,
    });
    const privatePem = toPem('PRIVATE KEY', await crypto.subtle.exportKey('pkcs8', keys.privateKey));
    const token = await signJwt({ alg: 'ES256' }, { a: 1 }, privatePem);
    expect((await verifyJwtSignature(token, cert.toString('pem'))).status).toBe('valid');
  });

  it('explains key mistakes', async () => {
    const es = await generateJwtKeyPair('ES256');
    const rs = await generateJwtKeyPair('RS256');
    const esToken = await signJwt({ alg: 'ES256' }, { a: 1 }, es.privateKeyPem);

    expect(await verifyJwtSignature(esToken, '')).toEqual({ status: 'error', message: 'Enter a public key to verify the signature.' });
    expect((await verifyJwtSignature(esToken, 'not a key')).message).toMatch(/PEM public key, a JWK, or a JWKS/);
    expect((await verifyJwtSignature(esToken, rs.publicKeyPem)).message).toMatch(/does not fit ES256/);
    expect((await verifyJwtSignature(esToken, '{"kty":"EC"')).message).toMatch(/not valid JSON/);
    expect((await verifyJwtSignature(esToken, '-----BEGIN ENCRYPTED PRIVATE KEY-----\nAAAA\n-----END ENCRYPTED PRIVATE KEY-----')).message).toMatch(/encrypted/i);

    const hsToken = await signJwt({ alg: 'HS256' }, { a: 1 }, 'secret');
    expect((await verifyJwtSignature(hsToken, rs.publicKeyPem)).message).toMatch(/shared secret/);

    const jwkWithAlg = JSON.stringify({ ...(await derivePublicKey('ES256', es.privateKeyPem)).jwk, alg: 'ES384' });
    expect((await verifyJwtSignature(esToken, jwkWithAlg)).message).toMatch(/key is for ES384/);
  }, 30000);

  it('reports unsigned and unknown algorithms', async () => {
    const make = (alg: string) => `${b64url(JSON.stringify({ alg }))}.${b64url(JSON.stringify({ a: 1 }))}.`;
    expect(await verifyJwtSignature(make('none'), '')).toEqual({ status: 'unsupported', message: 'Unsigned token (alg "none")' });
    expect((await verifyJwtSignature(make('XY1'), 'x')).status).toBe('unsupported');
  });

  it('signs HS tokens that the verifier accepts', async () => {
    for (const alg of ['HS256', 'HS384', 'HS512'] as const) {
      const token = await signJwt({ alg, typ: 'JWT' }, { sub: 'ü' }, 'secret');
      expect((await verifyJwtSignature(token, 'secret')).status).toBe('valid');
      expect(decodeJwt(token).payload.sub).toBe('ü');
    }
    const b64 = Buffer.from([1, 2, 3, 255]).toString('base64');
    const token = await signJwt({ alg: 'HS256' }, { a: 1 }, b64, { secretIsBase64: true });
    expect((await verifyJwtSignature(token, b64, { secretIsBase64: true })).status).toBe('valid');
  });

  it('refuses to sign without a key or with a public key', async () => {
    await expect(signJwt({ alg: 'HS256' }, {}, '')).rejects.toThrow(/Enter a secret/);
    const { publicKeyPem } = await generateJwtKeyPair('ES256');
    await expect(signJwt({ alg: 'ES256' }, {}, publicKeyPem)).rejects.toThrow(/private key/);
    await expect(signJwt({ alg: 'none' }, {}, 'x')).rejects.toThrow(/Choose an algorithm/);
  });

  it('lists the algorithms the encoder offers', () => {
    expect(JWT_ALGORITHMS).toEqual(['HS256', 'HS384', 'HS512', ...ASYMMETRIC]);
  });
});

describe('decodeJwt text handling', () => {
  it('decodes UTF-8 claims', () => {
    const token = `${b64url('{"alg":"HS256"}')}.${b64url('{"name":"Jürgen 東京"}')}.sig`;
    expect(decodeJwt(token).payload.name).toBe('Jürgen 東京');
  });

  it('trims surrounding whitespace and a Bearer prefix', () => {
    const token = `${b64url('{"alg":"HS256"}')}.${b64url('{"a":1}')}.sig`;
    expect(decodeJwt(`  Bearer ${token}\n`).payload.a).toBe(1);
  });
});

describe('time claims', () => {
  const now = Date.UTC(2026, 0, 1, 12, 0, 0);
  const sec = (ms: number) => Math.floor(ms / 1000);

  it('formats relative times with two units', () => {
    expect(formatRelativeTime(0)).toBe('now');
    expect(formatRelativeTime(45_000)).toBe('in 45 s');
    expect(formatRelativeTime(-90 * 60_000)).toBe('1 h 30 min ago');
    expect(formatRelativeTime(3 * 86_400_000 + 4 * 3_600_000)).toBe('in 3 d 4 h');
    expect(formatRelativeTime(-2 * 365 * 86_400_000)).toBe('2 y ago');
  });

  it('reports a valid token', () => {
    const info = describeTimeClaims({ iat: sec(now) - 60, exp: sec(now) + 3600 }, now);
    expect(info.state).toBe('active');
    expect(info.summary).toBe('Expires in 1 h');
    expect(info.claims.map((c) => c.claim)).toEqual(['iat', 'exp']);
    expect(info.claims[0].relative).toBe('1 min ago');
  });

  it('reports an expired token', () => {
    const info = describeTimeClaims({ exp: sec(now) - 7200 }, now);
    expect(info.state).toBe('expired');
    expect(info.summary).toBe('Expired 2 h ago');
  });

  it('reports a token that is not valid yet', () => {
    const info = describeTimeClaims({ nbf: sec(now) + 300, exp: sec(now) + 3600 }, now);
    expect(info.state).toBe('not-yet-valid');
    expect(info.summary).toBe('Not valid yet (valid in 5 min)');
  });

  it('reports a missing exp claim', () => {
    expect(describeTimeClaims({ sub: 'x' }, now)).toMatchObject({ state: 'no-expiry', summary: 'No exp claim', claims: [] });
  });

  it('warns about milliseconds and non-numeric values', () => {
    const info = describeTimeClaims({ exp: now + 3_600_000, iat: 'yesterday' }, now);
    expect(info.claims.find((c) => c.claim === 'exp')?.warning).toMatch(/milliseconds/);
    expect(info.claims.find((c) => c.claim === 'iat')).toMatchObject({ date: null, warning: 'Not a number' });
  });
});

describe('encoder helpers', () => {
  it('sets the header algorithm and keeps other fields', () => {
    expect(setHeaderAlgorithm('{"alg":"HS256","typ":"JWT","kid":"k"}', 'ES256')).toBe(
      '{\n  "alg": "ES256",\n  "typ": "JWT",\n  "kid": "k"\n}'
    );
    expect(setHeaderAlgorithm('not json', 'RS256')).toBe('{\n  "alg": "RS256",\n  "typ": "JWT"\n}');
  });

  it('refreshes iat, nbf and exp and keeps the lifetime', () => {
    const text = JSON.stringify({ sub: 'a', iat: 100, nbf: 100, exp: 100 + 900 });
    expect(JSON.parse(refreshTimeClaims(text, 5000))).toEqual({ sub: 'a', iat: 5000, nbf: 5000, exp: 5900 });
    expect(JSON.parse(refreshTimeClaims('{"sub":"a"}', 5000))).toEqual({ sub: 'a', iat: 5000, exp: 8600 });
    expect(refreshTimeClaims('nope', 5000)).toBe('nope');
  });
});
