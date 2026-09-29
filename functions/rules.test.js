const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { addDoc, collection, doc, getDoc, setDoc, updateDoc } = require('firebase/firestore');

const appId = 'strangercam-prod';
const roomPath = `artifacts/${appId}/public/data/rooms/room-1`;
let testEnvironment;
const verifiedClaims = { email_verified: true };

function userDb(uid, claims = {}) {
  return testEnvironment.authenticatedContext(uid, { ...verifiedClaims, ...claims }).firestore();
}

function documentPath(collectionName, id) {
  return `artifacts/${appId}/public/data/${collectionName}/${id}`;
}

test.before(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId: 'strangercam-rules-test',
    firestore: {
      rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8')
    }
  });
});

test.after(async () => {
  await testEnvironment.cleanup();
});

test.beforeEach(async () => {
  await testEnvironment.clearFirestore();
});

test('users without verified email cannot read or create a queue entry', async () => {
  const db = userDb('unverified', { email_verified: false });
  await assertFails(getDoc(doc(db, documentPath('queue', 'unverified'))));
  await assertFails(setDoc(doc(db, documentPath('queue', 'unverified')), {
    uid: 'unverified', status: 'waiting', timestamp: Date.now()
  }));
});

test('verified users can create only their own queue entry', async () => {
  const db = userDb('alice');
  await assertSucceeds(setDoc(doc(db, documentPath('queue', 'alice')), {
    uid: 'alice', status: 'waiting', timestamp: Date.now()
  }));
  await assertFails(setDoc(doc(db, documentPath('queue', 'bob')), {
    uid: 'bob', status: 'waiting', timestamp: Date.now()
  }));
});

test('verified users share the default room chat but cannot impersonate another sender', async () => {
  const alice = userDb('alice');
  const bob = userDb('bob');
  const unverified = userDb('unverified', { email_verified: false });
  const messageCollection = collection(alice, 'artifacts', appId, 'public', 'data', 'messages');
  const message = { uid: 'alice', text: 'Hola sala', timestamp: Date.now() };

  await assertSucceeds(addDoc(messageCollection, message));
  await assertSucceeds(getDoc(doc(bob, 'artifacts', appId, 'public', 'data', 'messages', 'message-1')));
  await assertFails(addDoc(messageCollection, { ...message, uid: 'bob' }));
  await assertFails(addDoc(collection(unverified, 'artifacts', appId, 'public', 'data', 'messages'), message));
});

test('presence exposes only a user-owned heartbeat and aggregate counters', async () => {
  const alice = userDb('alice');
  await assertSucceeds(getDoc(doc(alice, documentPath('presence', 'alice'))));
  await assertFails(getDoc(doc(alice, documentPath('presence', 'bob'))));
  const summaryPath = documentPath('stats', 'summary');
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), summaryPath), { activeUsers: 2, activeRooms: 1 });
  });
  await assertSucceeds(getDoc(doc(alice, summaryPath)));
  await assertFails(setDoc(doc(alice, summaryPath), { activeUsers: 999 }));
});

test('banned users cannot rejoin the queue', async () => {
  const db = userDb('banned-user');
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), documentPath('bans', 'banned-user')), { uid: 'banned-user' });
  });
  await assertFails(setDoc(doc(db, documentPath('queue', 'banned-user')), {
    uid: 'banned-user', status: 'waiting', timestamp: Date.now()
  }));
});

test('reports are private to moderators and direct client report writes are denied', async () => {
  const alice = userDb('alice');
  const moderator = userDb('mod-1', { moderator: true });
  const report = {
    reporterUid: 'alice', reportedUid: 'bob', category: 'Spam', details: 'Test',
    chatSnippet: '', timestamp: Date.now(), dateString: 'test'
  };
  const reports = collection(alice, 'artifacts', appId, 'public', 'data', 'reports');
  const reportPath = documentPath('reports', 'report-1');
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), reportPath), report);
  });
  await assertFails(getDoc(doc(alice, reportPath)));
  await assertSucceeds(getDoc(doc(moderator, reportPath)));
  await assertFails(addDoc(reports, report));
});

test('only room participants may read signaling and only the assigned side may update SDP', async () => {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), roomPath), {
      participants: ['alice', 'bob'], initiatorUid: 'alice', peerUid: 'bob'
    });
  });
  const aliceDb = userDb('alice');
  const bobDb = userDb('bob');
  const outsiderDb = userDb('mallory');
  await assertSucceeds(getDoc(doc(aliceDb, roomPath)));
  await assertSucceeds(getDoc(doc(bobDb, roomPath)));
  await assertFails(getDoc(doc(outsiderDb, roomPath)));
  await assertSucceeds(updateDoc(doc(aliceDb, roomPath), { offer: { type: 'offer', sdp: 'test' } }));
  await assertFails(updateDoc(doc(bobDb, roomPath), { offer: { type: 'offer', sdp: 'forbidden' } }));
  await assertSucceeds(updateDoc(doc(bobDb, roomPath), { answer: { type: 'answer', sdp: 'test' } }));

  const ice = { candidate: 'candidate:1', sdpMid: '0', sdpMLineIndex: 0, usernameFragment: 'test' };
  await assertSucceeds(setDoc(doc(aliceDb, `${roomPath}/callerCandidates/alice-ice`), ice));
  await assertFails(setDoc(doc(bobDb, `${roomPath}/callerCandidates/bob-forbidden-ice`), ice));
  await assertSucceeds(setDoc(doc(bobDb, `${roomPath}/calleeCandidates/bob-ice`), ice));
  await assertFails(getDoc(doc(outsiderDb, `${roomPath}/callerCandidates/alice-ice`)));
});

test('client-side moderation writes are denied even to a moderator token', async () => {
  const moderator = userDb('mod-1', { moderator: true });
  await assertFails(setDoc(doc(moderator, documentPath('bans', 'bob')), { uid: 'bob' }));
  await assertFails(setDoc(doc(moderator, documentPath('settings', 'config')), { announcement: 'x' }));
});
