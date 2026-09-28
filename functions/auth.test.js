const test = require('node:test');
const assert = require('node:assert/strict');
const { hasVerifiedEmail } = require('./auth');

test('allows only Firebase tokens with a verified email', () => {
  assert.equal(hasVerifiedEmail({ email_verified: true }), true);
  assert.equal(hasVerifiedEmail({ email_verified: false }), false);
  assert.equal(hasVerifiedEmail({}), false);
  assert.equal(hasVerifiedEmail(null), false);
});