// Portable package: single-file app + Windows launcher + readme in dist-standalone/
import { copyFileSync, renameSync, statSync } from 'node:fs';
renameSync('dist-standalone/index.html', 'dist-standalone/Balkenrechner.html');
copyFileSync('standalone/Balkenrechner starten.cmd', 'dist-standalone/Balkenrechner starten.cmd');
copyFileSync('standalone/LIESMICH.txt', 'dist-standalone/LIESMICH.txt');
console.log(`dist-standalone/Balkenrechner.html  ${(statSync('dist-standalone/Balkenrechner.html').size / 1e6).toFixed(2)} MB`);
