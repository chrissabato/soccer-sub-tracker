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

test('normalizeMinute', () => {
    assert.equal(normalizeMinute('67'), '67');
    assert.equal(normalizeMinute("67'"), '67');
    assert.equal(normalizeMinute('45+2'), '45+2');
    assert.equal(normalizeMinute(' 90 + 3 '), '90+3');
    assert.equal(normalizeMinute('07'), '7');
    assert.equal(normalizeMinute(''), null);
    assert.equal(normalizeMinute('45+'), null);
    assert.equal(normalizeMinute('abc'), null);
    assert.equal(normalizeMinute('1000'), null);
});

test('minuteSortValue orders stoppage time', () => {
    const sorted = ['46', '45+2', '45', '90+10', '90+3'].sort((a, b) => minuteSortValue(a) - minuteSortValue(b));
    assert.deepEqual(sorted, ['45', '45+2', '46', '90+3', '90+10']);
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
