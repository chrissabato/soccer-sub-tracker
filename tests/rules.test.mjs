// Firestore security rules. Needs the emulator: npm run test:rules
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import {
    initializeTestEnvironment, assertSucceeds, assertFails,
} from '@firebase/rules-unit-testing';
import {
    doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, collection, writeBatch,
    serverTimestamp, Timestamp,
} from 'firebase/firestore';

let env;
const CODE = 'ABC234';
const team = (name) => ({ name, url: '' });
const player = (number, name = '') => ({ number, name });

before(async () => {
    env = await initializeTestEnvironment({
        projectId: 'demo-soccer-sub-tracker',
        firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
    });
});
after(() => env && env.cleanup());
beforeEach(() => env.clearFirestore());

const as = (uid) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore();

function createBatch(db, uid, gid = 'g1', code = CODE) {
    const b = writeBatch(db);
    b.set(doc(db, 'games', gid), {
        home: team('Home U'), away: team('Away U'), division: 'womens',
        createdAt: serverTimestamp(), creatorUid: uid,
    });
    b.set(doc(db, 'games', gid, 'secret', 'code'), { code });
    b.set(doc(db, 'codes', code), { gameId: gid });
    b.set(doc(db, 'games', gid, 'editors', uid), { code });
    return b;
}

const pendingSub = () => ({
    team: 'home', playerIn: player('4', 'A'), playerOut: player('10', 'B'),
    status: 'pending', minute: null, createdAt: serverTimestamp(), executedAt: null, batchId: null,
});

// Seed a game bypassing rules; createdAt can be backdated.
async function seed({ createdAt = Timestamp.now() } = {}) {
    await env.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, 'games', 'g1'), {
            home: team('H'), away: team('A'), division: 'mens', createdAt, creatorUid: 'creator',
        });
        await setDoc(doc(db, 'games', 'g1', 'secret', 'code'), { code: CODE });
        await setDoc(doc(db, 'codes', CODE), { gameId: 'g1' });
        await setDoc(doc(db, 'games', 'g1', 'editors', 'creator'), { code: CODE });
        await setDoc(doc(db, 'games', 'g1', 'subs', 's1'), { ...pendingSub(), createdAt });
        await setDoc(doc(db, 'games', 'g1', 'rosters', 'home'), { players: [], sourceUrl: '', updatedAt: createdAt });
    });
}

test('signed-in user can create a game in one batch', async () => {
    await assertSucceeds(createBatch(as('u1'), 'u1').commit());
});

test('creation fails if the code is not claimed in codes/', async () => {
    const db = as('u1');
    const b = writeBatch(db);
    b.set(doc(db, 'games', 'g1'), {
        home: team('H'), away: team('A'), division: 'womens', createdAt: serverTimestamp(), creatorUid: 'u1',
    });
    b.set(doc(db, 'games', 'g1', 'secret', 'code'), { code: CODE });
    await assertFails(b.commit());
});

test('cannot reuse a code another game already holds', async () => {
    await seed();
    await assertFails(createBatch(as('u2'), 'u2', 'g2', CODE).commit());
});

test('cannot create a game for someone else or unauthenticated', async () => {
    await assertFails(createBatch(as('u1'), 'someone-else').commit());
    await assertFails(createBatch(as(null), 'x').commit());
});

test('anyone can read the game, subs and rosters, but not the code', async () => {
    await seed();
    const db = as(null);
    await assertSucceeds(getDoc(doc(db, 'games', 'g1')));
    await assertSucceeds(getDocs(collection(db, 'games', 'g1', 'subs')));
    await assertSucceeds(getDoc(doc(db, 'games', 'g1', 'rosters', 'home')));
    await assertFails(getDoc(doc(db, 'games', 'g1', 'secret', 'code')));
    await assertFails(getDoc(doc(as('viewer'), 'games', 'g1', 'secret', 'code')));
});

test('codes can be looked up but not listed', async () => {
    await seed();
    await assertSucceeds(getDoc(doc(as(null), 'codes', CODE)));
    await assertFails(getDocs(collection(as(null), 'codes')));
});

test('joining requires the right code', async () => {
    await seed();
    await assertFails(setDoc(doc(as('u2'), 'games', 'g1', 'editors', 'u2'), { code: 'ZZZ999' }));
    await assertFails(setDoc(doc(as('u2'), 'games', 'g1', 'editors', 'u3'), { code: CODE }));
    await assertSucceeds(setDoc(doc(as('u2'), 'games', 'g1', 'editors', 'u2'), { code: CODE }));
    await assertSucceeds(getDoc(doc(as('u2'), 'games', 'g1', 'secret', 'code')));
});

test('only editors write subs, rosters and game fields', async () => {
    await seed();
    const outsider = as('outsider');
    await assertFails(setDoc(doc(outsider, 'games', 'g1', 'subs', 'x'), pendingSub()));
    await assertFails(updateDoc(doc(outsider, 'games', 'g1', 'subs', 's1'), { status: 'done', minute: '10' }));
    await assertFails(deleteDoc(doc(outsider, 'games', 'g1', 'subs', 's1')));
    await assertFails(setDoc(doc(outsider, 'games', 'g1', 'rosters', 'home'), { players: [], sourceUrl: '', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(outsider, 'games', 'g1'), { division: 'womens' }));

    const editor = as('creator');
    await assertSucceeds(setDoc(doc(editor, 'games', 'g1', 'subs', 'x'), pendingSub()));
    await assertSucceeds(updateDoc(doc(editor, 'games', 'g1', 'subs', 's1'), {
        status: 'done', minute: '45+2', executedAt: serverTimestamp(), batchId: 'b1',
    }));
    await assertSucceeds(setDoc(doc(editor, 'games', 'g1', 'rosters', 'away'), {
        players: [{ number: '1', name: 'X' }], sourceUrl: '', updatedAt: serverTimestamp(),
    }));
    await assertSucceeds(updateDoc(doc(editor, 'games', 'g1'), { division: 'womens', home: team('New') }));
    await assertFails(updateDoc(doc(editor, 'games', 'g1'), { creatorUid: 'creator2' }));
    await assertSucceeds(deleteDoc(doc(editor, 'games', 'g1', 'subs', 'x')));
});

test('team colors must be #rrggbb and are optional', async () => {
    await seed();
    const editor = as('creator');
    await assertSucceeds(updateDoc(doc(editor, 'games', 'g1'), { home: { name: 'H', url: '', color: '#ffd700' } }));
    await assertSucceeds(updateDoc(doc(editor, 'games', 'g1'), { home: { name: 'H', url: '' } }));
    await assertFails(updateDoc(doc(editor, 'games', 'g1'), { home: { name: 'H', url: '', color: 'red' } }));
    await assertFails(updateDoc(doc(editor, 'games', 'g1'), { home: { name: 'H', url: '', color: '#FFD700' } }));
    await assertFails(updateDoc(doc(editor, 'games', 'g1'), { home: { name: 'H', url: '', color: '#ffd700', logo: 'x' } }));
});

test('sub shape is validated', async () => {
    await seed();
    const editor = as('creator');
    await assertFails(setDoc(doc(editor, 'games', 'g1', 'subs', 'a'), { ...pendingSub(), team: 'third' }));
    await assertFails(setDoc(doc(editor, 'games', 'g1', 'subs', 'b'), { ...pendingSub(), minute: 'soon' }));
    await assertFails(setDoc(doc(editor, 'games', 'g1', 'subs', 'c'), { ...pendingSub(), extra: 1 }));
    await assertFails(setDoc(doc(editor, 'games', 'g1', 'subs', 'd'), { ...pendingSub(), playerIn: player('1234') }));
});

test('nothing can be deleted by outsiders before 72 hours', async () => {
    await seed();
    const db = as(null);
    await assertFails(deleteDoc(doc(db, 'games', 'g1')));
    await assertFails(deleteDoc(doc(db, 'codes', CODE)));
    await assertFails(deleteDoc(doc(db, 'games', 'g1', 'subs', 's1')));
});

test('after 72 hours an unauthenticated client can clean up everything', async () => {
    await seed({ createdAt: Timestamp.fromMillis(Date.now() - 73 * 3600 * 1000) });
    const db = as(null);
    await assertSucceeds(getDocs(collection(db, 'games', 'g1', 'editors')));
    await assertSucceeds(getDoc(doc(db, 'games', 'g1', 'secret', 'code')));
    await assertSucceeds(deleteDoc(doc(db, 'games', 'g1', 'subs', 's1')));
    await assertSucceeds(deleteDoc(doc(db, 'games', 'g1', 'rosters', 'home')));
    await assertSucceeds(deleteDoc(doc(db, 'games', 'g1', 'editors', 'creator')));
    await assertSucceeds(deleteDoc(doc(db, 'games', 'g1', 'secret', 'code')));
    await assertSucceeds(deleteDoc(doc(db, 'codes', CODE)));
    await assertSucceeds(deleteDoc(doc(db, 'games', 'g1')));
});
