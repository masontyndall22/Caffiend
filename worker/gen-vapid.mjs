// Generates a VAPID key pair for web push. Run once: node gen-vapid.mjs
// Public key goes in js/config.js and as a Worker secret; private key ONLY as a Worker secret.
const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const raw = new Uint8Array(await crypto.subtle.exportKey('raw', publicKey));
const jwk = await crypto.subtle.exportKey('jwk', privateKey);
const b64u = (b) => Buffer.from(b).toString('base64url');
console.log('VAPID_PUBLIC_KEY =', b64u(raw));
console.log('VAPID_PRIVATE_KEY =', jwk.d);
