import { setTimeout as sleep } from 'node:timers/promises';
console.log('[main] build-watch: JS sources, nothing to build. Keeping process alive.');
while (true) { await sleep(60_000); }
