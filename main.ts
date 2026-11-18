// SOLMAR — a complete coastal crime story, authored for the open web.
// Jax Moreno returns to a sunlit port city to rebuild a life behind the wheel.
// Five connected jobs lead from a first fare to the Meridian Bank getaway.
// The city, cast, vehicles, geometry, interface and synthesizer are original.
// This deterministic packer ships the playable static game and its real renders.
// It uses only Node's standard library and the kit's unchanged dossier writer.
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repository = fileURLToPath(new URL('.', import.meta.url));
const destination = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(destination, { recursive: true });
for (const directory of ['game', 'screenshots']) {
  mkdirSync(join(destination, directory), { recursive: true });
  cpSync(join(repository, directory), join(destination, directory), { recursive: true });
}
const dossier = buildDossier(destination, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(destination, 'dossier.json'), dossier);
console.log('SOLMAR: static game, original screenshots, and dossier written.');
