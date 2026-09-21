// Throwaway verification: reproduces getElementsWeaknesses including the neutral completion.
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');

const scoreMap = { immune_to: -3, super_strong_vs: -2, strong_vs: -1, weak_to: 1, super_weak_to: 2 };
function scoreToMultiplier(s) {
    if (s <= -3) return 0;
    if (s === -2) return 0.25;
    if (s === -1) return 0.5;
    if (s === 0) return 1;
    if (s === 1) return 2;
    return 4;
}

const dir = path.join(__dirname, 'src/data/combat/elements');
const ids = fs.readdirSync(dir).map((f) => f.replace('.yaml', ''));
const all = ids.map((id) => ({ id, ...yaml.load(fs.readFileSync(path.join(dir, id + '.yaml'), 'utf8')) }));

const received = process.argv.slice(2);
const consolidated = {};
for (const id of received) {
    const el = all.find((e) => e.id === id);
    for (const [prop, s] of Object.entries(scoreMap)) {
        for (const target of el[prop] || []) consolidated[target] = (consolidated[target] || 0) + s;
    }
}

const complete = {};
for (const el of all) {
    if (el.type !== 'common') continue;
    complete[el.id] = { score: consolidated[el.id] ?? 0 };
}

const keys = Object.keys(complete).sort();
console.log(`receiving [${received.join(', ')}] -> ${keys.length} rows`);
for (const key of keys) {
    console.log(`  ${key.padEnd(18)} score=${String(complete[key].score).padStart(3)}  x${scoreToMultiplier(complete[key].score)}`);
}
