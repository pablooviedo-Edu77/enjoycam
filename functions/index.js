const { initializeApp, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');
const { HttpsError, onCall } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { randomUUID } = require('node:crypto');
const { hasVerifiedEmail } = require('./auth');

if (!getApps().length) initializeApp();

const auth = getAuth();
const db = getFirestore();
const APP_ID = 'strangercam-prod';
const REGION = 'us-central1';
const REPORT_CATEGORIES = new Set([
  'Desnudez/Contenido inapropiado',
  'Acoso/Insultos',
  'Spam/Bot',
  'Menor de edad',
  'Otro'
]);
const publicCollection = (name) => db.collection(`artifacts/${APP_ID}/public/data/${name}`);
const publicDocument = (name, id) => publicCollection(name).doc(id);

function requireSignedIn(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Inicia sesion para continuar.');
  return request.auth;
}

function requireVerified(request) {
  const user = requireSignedIn(request);
  if (!hasVerifiedEmail(user.token)) {
    throw new HttpsError('permission-denied', 'Verifica tu correo antes de continuar.');
  }
  return user;
}

async function requireModerator(request) {
  const user = requireVerified(request);
  if (user.token.moderator !== true) {
    throw new HttpsError('permission-denied', 'Se requieren permisos de moderacion.');
  }
  const ban = await publicDocument('bans', user.uid).get();
  if (ban.exists) throw new HttpsError('permission-denied', 'La cuenta de moderacion esta suspendida.');
  return user;
}

exports.submitReport = onCall({ region: REGION }, async (request) => {
  const caller = requireVerified(request);
  const reportedUid = typeof request.data?.reportedUid === 'string' ? request.data.reportedUid : '';
  const roomId = typeof request.data?.roomId === 'string' ? request.data.roomId : '';
  const category = typeof request.data?.category === 'string' ? request.data.category : '';
  const details = typeof request.data?.details === 'string' ? request.data.details.trim() : '';
  const chatSnippet = typeof request.data?.chatSnippet === 'string' ? request.data.chatSnippet.slice(-3000) : '';

  if (!reportedUid || reportedUid === caller.uid || !roomId || !REPORT_CATEGORIES.has(category)) {
    throw new HttpsError('invalid-argument', 'El reporte no contiene una sala o categoria valida.');
  }
  if (details.length > 1000) throw new HttpsError('invalid-argument', 'Los detalles superan 1000 caracteres.');

  const roomSnapshot = await publicDocument('rooms', roomId).get();
  if (!roomSnapshot.exists || roomSnapshot.data().endedAt ||
      !roomSnapshot.data().participants.includes(caller.uid) ||
      !roomSnapshot.data().participants.includes(reportedUid)) {
    throw new HttpsError('permission-denied', 'Solo puedes reportar a alguien de tu sala actual.');
  }

  const now = Date.now();
  const rateRef = db.collection('reportRateLimits').doc(caller.uid);
  await db.runTransaction(async (transaction) => {
    const rateSnapshot = await transaction.get(rateRef);
    const rate = rateSnapshot.data() || {};
    const windowStart = rate.windowStart || now;
    const count = now - windowStart >= 600_000 ? 0 : (rate.count || 0);
    if (count >= 5) throw new HttpsError('resource-exhausted', 'Alcanzaste el limite temporal de reportes.');
    transaction.set(rateRef, { windowStart: count === 0 ? now : windowStart, count: count + 1 });
  });

  const report = await publicCollection('reports').add({
    reporterUid: caller.uid,
    reportedUid,
    category,
    details: details || 'Sin detalles adicionales',
    chatSnippet,
    timestamp: now,
    dateString: new Date(now).toLocaleString('es')
  });
  return { reportId: report.id };
});

exports.matchQueue = onCall({ region: REGION }, async (request) => {
  const caller = requireVerified(request);
  const queue = publicCollection('queue');
  const ownRef = queue.doc(caller.uid);
  const banRef = publicDocument('bans', caller.uid);
  const queueQuery = queue.where('status', '==', 'waiting').limit(30);

  return db.runTransaction(async (transaction) => {
    const [ownSnapshot, waitingSnapshot, banSnapshot] = await Promise.all([
      transaction.get(ownRef),
      transaction.get(queueQuery),
      transaction.get(banRef)
    ]);
    if (banSnapshot.exists) throw new HttpsError('permission-denied', 'La cuenta esta suspendida.');
    if (!ownSnapshot.exists) return { matched: false };
    const own = ownSnapshot.data();
    if (own.status === 'matched') {
      return { matched: true, roomId: own.roomId, peerUid: own.peerUid, initiatorUid: own.initiatorUid };
    }
    if (own.status !== 'waiting') return { matched: false };

    const now = Date.now();
    const candidates = waitingSnapshot.docs
      .filter((snapshot) => snapshot.id !== caller.uid && now - snapshot.data().timestamp < 35_000)
      .sort((first, second) => first.data().timestamp - second.data().timestamp);
    const candidate = candidates[0];
    if (!candidate) return { matched: false };

    const candidateData = candidate.data();
    const initiatorUid = own.timestamp < candidateData.timestamp ||
      (own.timestamp === candidateData.timestamp && caller.uid < candidate.id)
      ? caller.uid
      : candidate.id;
    const roomId = `room_${randomUUID().replaceAll('-', '')}`;
    const roomRef = publicDocument('rooms', roomId);
    const participants = [caller.uid, candidate.id];

    transaction.create(roomRef, {
      participants,
      initiatorUid,
      peerUid: initiatorUid === caller.uid ? candidate.id : caller.uid,
      createdAt: FieldValue.serverTimestamp()
    });
    transaction.update(ownRef, {
      status: 'matched', roomId,
      peerUid: candidate.id,
      initiatorUid
    });
    transaction.update(candidate.ref, {
      status: 'matched', roomId,
      peerUid: caller.uid,
      initiatorUid
    });
    return { matched: true, roomId, peerUid: candidate.id, initiatorUid };
  });
});

exports.leaveRoom = onCall({ region: REGION }, async (request) => {
  const caller = requireVerified(request);
  const roomId = typeof request.data?.roomId === 'string' ? request.data.roomId : '';
  if (!roomId) return { left: true };

  const roomRef = publicDocument('rooms', roomId);
  await db.runTransaction(async (transaction) => {
    const roomSnapshot = await transaction.get(roomRef);
    if (!roomSnapshot.exists || !roomSnapshot.data().participants.includes(caller.uid)) return;
    transaction.update(roomRef, { endedAt: Date.now() });
    for (const participantUid of roomSnapshot.data().participants) {
      transaction.delete(publicDocument('queue', participantUid));
    }
  });
  return { left: true };
});

exports.moderateReport = onCall({ region: REGION }, async (request) => {
  await requireModerator(request);
  const action = request.data?.action;
  const reportId = typeof request.data?.reportId === 'string' ? request.data.reportId : '';
  const uid = typeof request.data?.uid === 'string' ? request.data.uid : '';

  if (action === 'dismiss') {
    if (!reportId) throw new HttpsError('invalid-argument', 'Falta el ID del reporte.');
    await publicDocument('reports', reportId).delete();
    return { updated: true };
  }
  if (action === 'ban' || action === 'unban') {
    const reportRef = reportId ? publicDocument('reports', reportId) : null;
    const reportSnapshot = reportRef ? await reportRef.get() : null;
    const targetUid = uid || reportSnapshot?.data()?.reportedUid;
    if (!targetUid || targetUid.length > 128) throw new HttpsError('invalid-argument', 'ID de usuario no valido.');
    const banRef = publicDocument('bans', targetUid);
    if (action === 'unban') {
      await banRef.delete();
    } else {
      await banRef.set({
        uid: targetUid,
        bannedAt: Date.now(),
        bannedDate: new Date().toLocaleString('es'),
        reason: 'Baneado por moderacion tras reporte de usuario.'
      });
      if (reportRef) await reportRef.delete();
    }
    return { updated: true, uid: targetUid };
  }
  throw new HttpsError('invalid-argument', 'Accion de moderacion no valida.');
});

exports.updateModerationSettings = onCall({ region: REGION }, async (request) => {
  await requireModerator(request);
  const patch = {};
  if (Array.isArray(request.data?.blacklist)) {
    const blacklist = request.data.blacklist;
    if (blacklist.length > 100 || blacklist.some((word) => typeof word !== 'string' || word.trim().length > 40)) {
      throw new HttpsError('invalid-argument', 'La lista de palabras no es valida.');
    }
    patch.blacklist = [...new Set(blacklist.map((word) => word.trim().toLowerCase()).filter(Boolean))];
  }
  if (typeof request.data?.announcement === 'string') {
    if (request.data.announcement.length > 500) throw new HttpsError('invalid-argument', 'El aviso supera 500 caracteres.');
    patch.announcement = request.data.announcement.trim();
  }
  if (!Object.keys(patch).length) throw new HttpsError('invalid-argument', 'No hay cambios para guardar.');
  await publicDocument('settings', 'config').set(patch, { merge: true });
  return { updated: true };
});

exports.refreshPublicStats = onSchedule({
  region: REGION,
  schedule: 'every 1 minutes'
}, async () => {
  const now = Date.now();
  const cutoff = now - 45_000;
  const presenceCollection = publicCollection('presence');
  const queueCollection = publicCollection('queue');
  const [snapshot, stalePresence, waitingQueue] = await Promise.all([
    presenceCollection.where('lastSeen', '>=', cutoff).get(),
    presenceCollection.where('lastSeen', '<', cutoff).get(),
    queueCollection.where('status', '==', 'waiting').get()
  ]);
  const activeRooms = new Set();
  let activeUsers = 0;
  snapshot.forEach((presenceSnapshot) => {
    const presence = presenceSnapshot.data();
    if (Number(presence.lastSeen || 0) < cutoff) return;
    activeUsers++;
    if (presence.inRoom && typeof presence.roomId === 'string') activeRooms.add(presence.roomId);
  });
  for (const presenceSnapshot of stalePresence.docs) {
    const presence = presenceSnapshot.data();
    if (presence.inRoom && typeof presence.roomId === 'string') {
      const roomRef = publicDocument('rooms', presence.roomId);
      await db.runTransaction(async (transaction) => {
        const roomSnapshot = await transaction.get(roomRef);
        if (!roomSnapshot.exists || roomSnapshot.data().endedAt) return;
        transaction.update(roomRef, { endedAt: now });
        for (const participantUid of roomSnapshot.data().participants || []) {
          transaction.delete(publicDocument('queue', participantUid));
        }
      });
    }
    await presenceSnapshot.ref.delete();
  }
  const staleQueue = waitingQueue.docs.filter((queueSnapshot) =>
    Number(queueSnapshot.data().timestamp || 0) < now - 35_000
  );
  if (staleQueue.length) {
    const batch = db.batch();
    staleQueue.forEach((queueSnapshot) => batch.delete(queueSnapshot.ref));
    await batch.commit();
  }
  await publicDocument('stats', 'summary').set({
    activeUsers,
    activeRooms: activeRooms.size,
    updatedAt: Date.now()
  });
});
