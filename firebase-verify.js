'use strict';

const https = require('https');
const jwt = require('jsonwebtoken');

const CERT_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

let certCache = null;
let certExpiry = 0;

function getProjectId() {
  return process.env.FIREBASE_PROJECT_ID || 'api-firebase-nabeelxd';
}

function fetchCerts() {
  return new Promise((resolve, reject) => {
    https.get(CERT_URL, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('Failed to fetch Firebase public keys: ' + res.statusCode));
      }
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try {
          const certs = JSON.parse(body);
          const maxAge = parseInt(res.headers['cache-control']?.match(/max-age=(\d+)/)?.[1] || '3600', 10);
          certCache = certs;
          certExpiry = Date.now() + maxAge * 1000;
          resolve(certs);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function getCerts() {
  if (certCache && Date.now() < certExpiry) return certCache;
  return fetchCerts();
}

function certToPEM(cert) {
  if (cert.includes('BEGIN CERTIFICATE')) return cert;
  return '-----BEGIN CERTIFICATE-----\n' + cert.match(/.{1,64}/g).join('\n') + '\n-----END CERTIFICATE-----\n';
}

async function verifyFirebaseToken(idToken) {
  if (!idToken || typeof idToken !== 'string') {
    throw new Error('Missing ID token');
  }

  const decodedHeader = jwt.decode(idToken, { complete: true });
  if (!decodedHeader || !decodedHeader.header.kid) {
    throw new Error('Malformed ID token');
  }

  const certs = await getCerts();
  const cert = certs[decodedHeader.header.kid];
  if (!cert) {
    throw new Error('Unknown signing key');
  }

  const projectId = getProjectId();
  const issuer = 'https://securetoken.google.com/' + projectId;

  const payload = jwt.verify(idToken, certToPEM(cert), {
    algorithms: ['RS256'],
    audience: projectId,
    issuer
  });

  return payload;
}

module.exports = { verifyFirebaseToken, getProjectId };
