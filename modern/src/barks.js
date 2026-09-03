/**
 * BARKS — MODERN (GOAL_LOOP M4.3)
 *
 * Text callouts from Cartel staff, projected above their heads as DOM labels
 * (like the objective marker). Presentation only: the AI's decisions and
 * numbers are untouched; game.js calls `bark()` at the classic state changes
 * (spotting Sandy, losing her, a colleague going down, the boss's rage).
 *
 * Rank flavour: guards are nervous, managers procedural, executives cold,
 * the Head Designer theatrical. One bark per enemy at a time, four on screen.
 */
import * as THREE from 'three';

const LINES = {
    alert: {
        0: ['Intruder!', "She's here!", 'Call security!', 'Uh… hello?', "It's the table lady!"],
        1: ['Escalating this.', 'Unauthorized personnel!', "She's on {floor}!", 'Log this incident.', 'Per policy: engage.'],
        2: ['There she is.', 'Handle it.', 'Clean this up.', "She's on {floor}. Move."],
        boss: ['So. The carpenter.', 'You call THAT design?', 'Welcome to my floor.'],
    },
    lost: {
        0: ["Where'd she go?", 'I lost her!', 'Anyone see her?'],
        1: ['Visual lost. Regroup.', 'She was right there.', 'Check the {zone}.'],
        2: ['Lost her. Spread out.', 'Find her.'],
        boss: ['Hiding? How… artisanal.'],
    },
    mandown: {
        0: ['Man down!', 'He got painted!', 'Oh no oh no'],
        1: ['We lost {name}!', 'Casualty report: one.', 'Medic? HR?'],
        2: ['Expendable.', 'Keep firing.'],
        boss: [],
    },
    rage: {
        boss: ['ENOUGH. Meet the SPRING COLLECTION.', 'You dare splatter MY showroom?!'],
    },
    advance: {
        0: ['Moving up!', 'Cover me!'],
        1: ['Advancing per protocol.', 'Closing distance.'],
        2: ['Push.', 'On her.'],
        boss: [],
    },
};
const RANK_NAME = { 0: 'Gary', 1: 'Pam', 2: 'Sterling' };
const RANK_TITLE = { 0: 'GUARD', 1: 'MANAGER', 2: 'EXECUTIVE', boss: 'HEAD DESIGNER' };

const _v = new THREE.Vector3();

export class Barks {
    constructor() {
        this.layer = document.getElementById('barks');
        this.active = []; // { el, e, until }
        this.lastGlobal = 0;
    }

    /** speak a line; returns false if throttled */
    bark(e, kind, ctx = {}, time = 0) {
        if (!this.layer) return false;
        const rank = e.variant === 'boss' ? 'boss' : e.variant;
        const pool = LINES[kind]?.[rank];
        if (!pool || !pool.length) return false;
        if (this.active.find(a => a.e === e)) return false;           // one at a time per enemy
        if (this.active.length >= 4) return false;
        if (kind !== 'rage' && time - this.lastGlobal < 0.35) return false; // no chorus
        this.lastGlobal = time;
        let text = pool[Math.floor(Math.random() * pool.length)];
        text = text.replace('{floor}', ctx.floor || 'the floor').replace('{zone}', ctx.zone || 'the offices').replace('{name}', ctx.name || 'a colleague');
        const el = document.createElement('div');
        el.className = 'bark' + (rank === 'boss' ? ' boss' : '');
        el.innerHTML = `<span class="bark-rank">${RANK_TITLE[rank]}</span><span class="bark-text">${text}</span>`;
        this.layer.appendChild(el);
        this.active.push({ el, e, until: time + (rank === 'boss' ? 2.6 : 1.7) });
        return true;
    }

    /** project active barks above heads; drop expired */
    update(time, camera, alive = true) {
        for (let i = this.active.length - 1; i >= 0; i--) {
            const a = this.active[i];
            if (time > a.until || !alive) { a.el.remove(); this.active.splice(i, 1); continue; }
            const h = a.e.model?.height || 0.9;
            _v.set(a.e.x, h + 0.18, a.e.y).project(camera);
            const off = _v.z > 1 || Math.abs(_v.x) > 1.1 || Math.abs(_v.y) > 1.1;
            a.el.style.display = off ? 'none' : '';
            if (!off) {
                a.el.style.left = ((_v.x + 1) / 2 * window.innerWidth).toFixed(0) + 'px';
                a.el.style.top = ((1 - _v.y) / 2 * window.innerHeight).toFixed(0) + 'px';
                const fade = Math.min(1, (a.until - time) / 0.4);
                a.el.style.opacity = fade.toFixed(2);
            }
        }
    }

    clear() { for (const a of this.active) a.el.remove(); this.active = []; }
}

export function rankName(e) { return RANK_NAME[e.variant] || 'someone'; }
