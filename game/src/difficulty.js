// A shared run setting; Normal preserves the original tuning and screenshot staging.
import { DIFFICULTY } from './config.js';

const difficulties = Object.fromEntries(Object.entries(DIFFICULTY)
  .map(([id, multipliers]) => [id, Object.freeze({ id, ...multipliers })]));
let difficulty = difficulties.normal;

export function setDifficulty(id) {
  difficulty = typeof id === 'string' && Object.hasOwn(difficulties, id)
    ? difficulties[id] : difficulties.normal;
  return difficulty;
}

export function currentDifficulty() {
  return difficulty;
}
