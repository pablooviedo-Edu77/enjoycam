function hasVerifiedEmail(token) {
  return token?.email_verified === true;
}

module.exports = { hasVerifiedEmail };