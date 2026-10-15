import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    generateCode, normalizeCode, CODE_PATTERN, normalizeMinute, minuteSortValue,
    season, guessRosterUrls, parsePasteList, byNumber, normalizeColor, contrastText,
} from '../public/js/lib.js';

test('generated codes match the pattern the rules enforce', () => {
    for (let i = 0; i < 200; i++) {
        assert.match(generateCode(), CODE_PATTERN);
    }
});

test('normalizeCode', () => {
    assert.equal(normalizeCode(' abc 234 '), 'ABC234');
    assert.equal(normalizeCode('abc-234'), 'ABC234');
    assert.equal(normalizeCode('ABC23'), '');
    assert.equal(normalizeCode('ABCO12'), ''); // O and 1 aren't in the alphabet
});

test('normalizeMinute takes MM:SS, with or without the colon', () => {
    assert.equal(normalizeMinute('67:23'), '67:23');
    assert.equal(normalizeMinute(' 67 : 23 '), '67:23');
    assert.equal(normalizeMinute('6723'), '67:23');
    assert.equal(normalizeMinute('523'), '5:23');
    assert.equal(normalizeMinute('0:45'), '0:45');
    assert.equal(normalizeMinute('07:05'), '7:05');
    assert.equal(normalizeMinute('9215'), '92:15');
    assert.equal(normalizeMinute('100:00'), '100:00');
    assert.equal(normalizeMinute('67'), null); // seconds required
    assert.equal(normalizeMinute('67:6'), null);
    assert.equal(normalizeMinute('67:60'), null);
    assert.equal(normalizeMinute('45+2'), null);
    assert.equal(normalizeMinute(''), null);
    assert.equal(normalizeMinute('abc'), null);
    assert.equal(normalizeMinute('1000:00'), null);
});

test('minuteSortValue orders by clock time', () => {
    const sorted = ['46:00', '45:59', '9:30', '90:05', '45:00'].sort((a, b) => minuteSortValue(a) - minuteSortValue(b));
    assert.deepEqual(sorted, ['9:30', '45:00', '45:59', '46:00', '90:05']);
});

test('season rolls over in July', () => {
    assert.equal(season(new Date(2026, 5, 30)), '2025-26');
    assert.equal(season(new Date(2026, 6, 1)), '2026-27');
    assert.equal(season(new Date(2099, 9, 1)), '2099-00');
});

test('guessRosterUrls', () => {
    const d = new Date(2026, 9, 15);
    assert.deepEqual(guessRosterUrls('https://adrianbulldogs.com/', 'womens', d), [
        'https://adrianbulldogs.com/sports/womens-soccer/roster',
        'https://adrianbulldogs.com/sports/wsoc/2026-27/roster',
    ]);
    assert.deepEqual(guessRosterUrls('https://x.edu', 'mens', d)[1], 'https://x.edu/sports/msoc/2026-27/roster');
    assert.deepEqual(guessRosterUrls('', 'mens', d), []);
    assert.deepEqual(guessRosterUrls('https://x.edu', '', d), []);
});

test('parsePasteList handles common formats', () => {
    const players = parsePasteList([
        '10 Jane Smith',
        '#4 Ana María López',
        '7, Kim Lee, Junior',
        '22\tBo Md\tSophomore',
        '9. Sam Bo',
        'Coach Without Number',
        '',
        '23',
        '  ',
    ].join('\n'));
    assert.deepEqual(players, [
        { number: '10', name: 'Jane Smith' },
        { number: '4', name: 'Ana María López' },
        { number: '7', name: 'Kim Lee' },
        { number: '22', name: 'Bo Md' },
        { number: '9', name: 'Sam Bo' },
        { number: '', name: 'Coach Without Number' },
    ]);
});

test('byNumber sorts numerically with unnumbered last', () => {
    const list = [{ number: '', name: 'Z' }, { number: '10', name: 'A' }, { number: '2', name: 'B' }];
    assert.deepEqual(list.sort(byNumber).map((p) => p.number), ['2', '10', '']);
});

test('normalizeColor', () => {
    assert.equal(normalizeColor('#1D4ED8'), '#1d4ed8');
    assert.equal(normalizeColor(' #abcdef '), '#abcdef');
    assert.equal(normalizeColor('#abc'), '');
    assert.equal(normalizeColor('red'), '');
    assert.equal(normalizeColor(undefined), '');
});

test('contrastText picks readable badge text', () => {
    assert.equal(contrastText('#000000'), '#ffffff');
    assert.equal(contrastText('#ffffff'), '#000000');
    assert.equal(contrastText('#1d4ed8'), '#ffffff'); // royal blue
    assert.equal(contrastText('#ffd700'), '#000000'); // gold
    assert.equal(contrastText('#8b0000'), '#ffffff'); // dark red
    assert.equal(contrastText('#00ff00'), '#000000'); // bright green
});
