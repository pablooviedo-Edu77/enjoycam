const test = require('node:test');
const assert = require('node:assert/strict');
const { generateOtp, hashOtp, verifyOtpHash, isOtpVerifiedForSession } = require('./otp');

test('generates an eight-digit decimal code', () => {
  for (let attempt = 0; attempt < 100; attempt++) {
    assert.match(generateOtp(), /^\d{8}$/);
  }
});

test('requires the OTP claim to match the current Firebase auth time', () => {
  assert.equal(isOtpVerifiedForSession({
    strangercamVerified: true,
    auth_time: 100,
    otpAuthTime: 100
  }), true);
  assert.equal(isOtpVerifiedForSession({
    strangercamVerified: true,
    auth_time: 101,
    otpAuthTime: 100
  }), false);
  assert.equal(isOtpVerifiedForSession({ auth_time: 100, otpAuthTime: 100 }), false);
});

test('validates only the matching code and user', () => {
  const code = '01234567';
  const hash = hashOtp('user-1', code, 'test-secret');
  assert.equal(verifyOtpHash('user-1', code, 'test-secret', hash), true);
  assert.equal(verifyOtpHash('user-2', code, 'test-secret', hash), false);
  assert.equal(verifyOtpHash('user-1', '01234568', 'test-secret', hash), false);
  assert.equal(verifyOtpHash('user-1', '1234567', 'test-secret', hash), false);
});
