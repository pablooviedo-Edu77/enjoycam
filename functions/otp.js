const { createHmac, randomInt, timingSafeEqual } = require('node:crypto');

function generateOtp() {
  return String(randomInt(0, 100_000_000)).padStart(8, '0');
}

function hashOtp(uid, code, secret) {
  return createHmac('sha256', secret).update(`${uid}:${code}`).digest('hex');
}

function verifyOtpHash(uid, code, secret, expectedHash) {
  if (typeof code !== 'string' || !/^\d{8}$/.test(code) || typeof expectedHash !== 'string') {
    return false;
  }
  const actual = Buffer.from(hashOtp(uid, code, secret), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function isOtpVerifiedForSession(token) {
  return token?.strangercamVerified === true && token.otpAuthTime === token.auth_time;
}

module.exports = { generateOtp, hashOtp, verifyOtpHash, isOtpVerifiedForSession };
