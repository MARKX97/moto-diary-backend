const crypto = require("crypto");

const encodeBase64Url = (value) => Buffer.from(value).toString("base64url");
const decodeBase64Url = (value) => Buffer.from(value, "base64url").toString("utf8");

const signHmacSha256 = (content, secret) =>
  crypto.createHmac("sha256", secret).update(content).digest("base64url");

const signJwt = (payload, secret, expiresInSec) => {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const body = {
    ...payload,
    iat: now,
    exp: now + expiresInSec,
  };
  const encodedHeader = encodeBase64Url(JSON.stringify(header));
  const encodedBody = encodeBase64Url(JSON.stringify(body));
  const signingInput = `${encodedHeader}.${encodedBody}`;
  const signature = signHmacSha256(signingInput, secret);
  return `${signingInput}.${signature}`;
};

const verifyJwt = (token, secret) => {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new Error("Invalid token format");

  const [encodedHeader, encodedBody, signature] = parts;
  const signingInput = `${encodedHeader}.${encodedBody}`;
  const expectedSignature = signHmacSha256(signingInput, secret);
  const actualBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSignature);

  if (actualBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(actualBuf, expectedBuf)) {
    throw new Error("Invalid token signature");
  }

  const payload = JSON.parse(decodeBase64Url(encodedBody));
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp <= now) {
    throw new Error("Token expired");
  }
  return payload;
};

module.exports = {
  signJwt,
  verifyJwt,
};
