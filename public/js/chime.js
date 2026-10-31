// Optional notification sound when a sub is executed, off by default. Adds
// a bell switch to the page header; the choice is saved per browser. The
// chime is synthesized with Web Audio, so there's no sound file to load.
const KEY = 'chime';

const BELL = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';
const BELL_OFF = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5"/><path d="M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><path d="m2 2 20 20"/></svg>';

let on = false;
try {
    on = localStorage.getItem(KEY) === 'on';
} catch (e) {
    // Blocked storage: stays off.
}

let ctx = null;

// Browsers only let audio start from a tap, so the context is created or
// resumed on one: the switch itself, or any tap on the page after a reload.
function unlock() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) {
        return Promise.resolve();
    }
    if (!ctx) {
        ctx = new AC();
    }
    return ctx.state === 'suspended' ? ctx.resume() : Promise.resolve();
}
['pointerdown', 'keydown'].forEach((type) => {
    document.addEventListener(type, () => {
        if (on) {
            unlock().catch(() => {});
        }
    }, { capture: true });
});

function tone(freq, start, length) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.35, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + length + 0.05);
}

// A suspended context holds its clock still, so a chime scheduled during
// a tap still plays once resume() takes effect. Otherwise only play when
// running, so a chime isn't queued up and played late.
function play(evenIfSuspended) {
    if (!ctx || (ctx.state !== 'running' && !evenIfSuspended)) {
        return;
    }
    const t = ctx.currentTime;
    tone(880, t, 0.5);
    tone(1318.5, t + 0.15, 0.7);
}

// Called by the page when a new batch of subs is executed.
export function chime() {
    if (on) {
        play();
    }
}

function addSwitch() {
    const header = document.querySelector('header.bar, header.pa-head');
    if (!header) {
        return;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sound-toggle';
    function update() {
        button.innerHTML = on ? BELL : BELL_OFF;
        button.title = on ? 'Sound on for new subs' : 'Sound off for new subs';
        button.setAttribute('aria-label', 'Sound for new subs');
        button.setAttribute('aria-pressed', String(on));
    }
    button.addEventListener('click', () => {
        on = !on;
        try {
            localStorage.setItem(KEY, on ? 'on' : 'off');
        } catch (e) {
            // Blocked storage: the switch still works for this page.
        }
        if (on) {
            // A short preview, so it's clear the sound works on this device.
            // Started inside the tap, which iOS needs to allow the sound.
            unlock().catch(() => {});
            play(true);
        }
        update();
    });
    update();
    header.appendChild(button);
}

addSwitch();
