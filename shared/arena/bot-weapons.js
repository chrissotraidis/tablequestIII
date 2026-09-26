import {ARENA_WEAPONS} from './rules.js';

export function chooseBotWeapon(owned, paint, distance) {
    const canUse=key=>owned.has(key)&&paint>=ARENA_WEAPONS[key].ammoCost;
    if(distance<2.1&&canUse('tableLeg'))return 'tableLeg';
    if(distance<8&&canUse('sprayer'))return 'sprayer';
    if(distance<15&&canUse('nailgun'))return 'nailgun';
    if(distance>3&&canUse('roller'))return 'roller';
    if(canUse('paintbrush'))return 'paintbrush';
    return canUse('tableLeg')?'tableLeg':null;
}
