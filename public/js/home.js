import { createGame, joinWithCode, team } from './store.js';
import { loadSchools, fillDatalist, findSchool } from './schools.js';

const $ = (id) => document.getElementById(id);
let schools = [];

loadSchools().then((list) => {
    schools = list;
    fillDatalist($('schools'), list);
});

$('join').addEventListener('submit', async (e) => {
    e.preventDefault();
    const button = e.submitter;
    button.disabled = true;
    $('join-error').textContent = '';
    try {
        const gameId = await joinWithCode($('code').value);
        location.href = 'entry.html?g=' + encodeURIComponent(gameId);
    } catch (err) {
        $('join-error').textContent = err.message;
        button.disabled = false;
    }
});

$('create').addEventListener('submit', async (e) => {
    e.preventDefault();
    const button = e.submitter;
    button.disabled = true;
    $('create-error').textContent = '';
    // The list may still be downloading if the form was filled quickly.
    schools = await loadSchools();
    const side = (input) => {
        const school = findSchool(schools, input.value);
        return team(school ? school.name : input.value, school ? school.url : '');
    };
    try {
        const { gameId } = await createGame({
            home: side($('home')),
            away: side($('away')),
            division: $('division').value,
        });
        location.href = 'setup.html?g=' + encodeURIComponent(gameId);
    } catch (err) {
        $('create-error').textContent = 'Could not create the game: ' + err.message;
        button.disabled = false;
    }
});
