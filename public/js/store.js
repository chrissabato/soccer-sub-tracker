// Every Firestore read and write the pages make. Document shapes are
// enforced by firestore.rules; keep the two in step.
import {
    doc, collection, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot,
    writeBatch, serverTimestamp, query, orderBy,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db, currentUser } from './firebase.js';
import { generateCode, normalizeCode, normalizeColor } from './lib.js';

const gameRef = (gid) => doc(db, 'games', gid);
const secretRef = (gid) => doc(db, 'games', gid, 'secret', 'code');
const editorRef = (gid, uid) => doc(db, 'games', gid, 'editors', uid);
const rosterRef = (gid, side) => doc(db, 'games', gid, 'rosters', side);
const subsCol = (gid) => collection(db, 'games', gid, 'subs');
const codeRef = (code) => doc(db, 'codes', code);

export function team(name = '', url = '', color = '') {
    const t = { name: String(name).trim().slice(0, 120), url: String(url).trim().slice(0, 300) };
    if (normalizeColor(color)) {
        t.color = normalizeColor(color);
    }
    return t;
}

// Creates a game in one batch (game, its secret code, the code lookup and
// the creator's editor doc). Returns { gameId, code }.
export async function createGame({ home, away, division }) {
    const user = await currentUser();
    for (let attempt = 0; attempt < 5; attempt++) {
        const code = generateCode();
        if ((await getDoc(codeRef(code))).exists()) {
            continue;
        }
        const ref = doc(collection(db, 'games'));
        const batch = writeBatch(db);
        batch.set(ref, {
            home, away, division,
            createdAt: serverTimestamp(),
            creatorUid: user.uid,
        });
        batch.set(secretRef(ref.id), { code });
        batch.set(codeRef(code), { gameId: ref.id });
        batch.set(editorRef(ref.id, user.uid), { code });
        await batch.commit();
        return { gameId: ref.id, code };
    }
    throw new Error('Could not generate a unique game code. Try again.');
}

// Looks up a game by code and makes this browser an editor of it.
// Returns the gameId; throws with a user-facing message on a bad code.
export async function joinWithCode(input) {
    const code = normalizeCode(input);
    if (!code) {
        throw new Error('Game codes are 6 letters and numbers.');
    }
    const user = await currentUser();
    const snap = await getDoc(codeRef(code));
    if (!snap.exists()) {
        throw new Error('No game has that code. It may have expired.');
    }
    const gameId = snap.data().gameId;
    await setDoc(editorRef(gameId, user.uid), { code });
    return gameId;
}

// Joins a specific game with a code (from the entry/setup page prompt).
export async function joinGame(gameId, input) {
    const joined = await joinWithCode(input);
    if (joined !== gameId) {
        throw new Error('That code is for a different game.');
    }
}

export async function isEditor(gameId) {
    const user = await currentUser();
    try {
        return (await getDoc(editorRef(gameId, user.uid))).exists();
    } catch (err) {
        return false;
    }
}

export async function getCode(gameId) {
    const snap = await getDoc(secretRef(gameId));
    return snap.exists() ? snap.data().code : '';
}

export function updateGame(gameId, fields) {
    return updateDoc(gameRef(gameId), fields);
}

export function saveRoster(gameId, side, players, sourceUrl = '') {
    return setDoc(rosterRef(gameId, side), {
        players: players.slice(0, 80).map((p) => ({
            number: String(p.number || '').slice(0, 3),
            name: String(p.name || '').slice(0, 120),
        })),
        sourceUrl: String(sourceUrl || '').slice(0, 300),
        updatedAt: serverTimestamp(),
    });
}

// --- live listeners; each returns an unsubscribe function ---

export function watchGame(gameId, cb, onError) {
    return onSnapshot(gameRef(gameId), (snap) => cb(snap.exists() ? snap.data() : null), onError);
}

export function watchRosters(gameId, cb, onError) {
    const rosters = { home: [], away: [] };
    const unsubs = ['home', 'away'].map((side) => onSnapshot(rosterRef(gameId, side), (snap) => {
        rosters[side] = snap.exists() ? (snap.data().players || []) : [];
        cb({ ...rosters });
    }, onError));
    return () => unsubs.forEach((u) => u());
}

// cb(subs, { fromCache }) with subs in queue order.
export function watchSubs(gameId, cb, onError) {
    return onSnapshot(
        query(subsCol(gameId), orderBy('createdAt')),
        { includeMetadataChanges: true },
        (snap) => {
            const subs = snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }));
            cb(subs, { fromCache: snap.metadata.fromCache });
        },
        onError,
    );
}

// --- subs ---

function player(p) {
    return { number: String(p.number || '').slice(0, 3), name: String(p.name || '').slice(0, 120) };
}

export function addSub(gameId, { team: side, playerIn, playerOut }) {
    const ref = doc(subsCol(gameId));
    return setDoc(ref, {
        team: side,
        playerIn: player(playerIn),
        playerOut: player(playerOut),
        status: 'pending',
        minute: null,
        createdAt: serverTimestamp(),
        executedAt: null,
        batchId: null,
    });
}

// Edits players/team on any sub, and the minute on an executed one.
export function editSub(gameId, subId, { team: side, playerIn, playerOut, minute }) {
    const fields = { team: side, playerIn: player(playerIn), playerOut: player(playerOut) };
    if (minute !== undefined) {
        fields.minute = minute;
    }
    return updateDoc(doc(subsCol(gameId), subId), fields);
}

export function cancelSub(gameId, subId) {
    return deleteDoc(doc(subsCol(gameId), subId));
}

// Executes pending subs together at one minute. They share a batchId so
// the viewer can highlight the whole stoppage's changes as "latest".
export async function executeSubs(gameId, subIds, minute) {
    const batch = writeBatch(db);
    const batchId = doc(collection(db, '_')).id;
    subIds.forEach((id) => {
        batch.update(doc(subsCol(gameId), id), {
            status: 'done',
            minute,
            executedAt: serverTimestamp(),
            batchId,
        });
    });
    await batch.commit();
}
