const { initializeApp, applicationDefault, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

async function main() {
  const [email, role = 'grant'] = process.argv.slice(2);
  if (!email || !['grant', 'revoke'].includes(role)) {
    console.error('Usage: npm run moderator -- user@example.com [grant|revoke]');
    process.exitCode = 2;
    return;
  }

  if (!getApps().length) {
    initializeApp({ credential: applicationDefault() });
  }

  const auth = getAuth();
  const user = await auth.getUserByEmail(email);
  const claims = { ...user.customClaims };
  if (role === 'grant') claims.moderator = true;
  else delete claims.moderator;
  await auth.setCustomUserClaims(user.uid, claims);
  console.log(`Moderator role ${role === 'grant' ? 'granted to' : 'revoked for'} ${email}.`);
  console.log('The user must sign out and sign in again to refresh the ID token.');
}

main().catch((error) => {
  console.error('Unable to update moderator role:', error.message);
  process.exitCode = 1;
});
