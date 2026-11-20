#!/usr/bin/env node
// pike-tell — mensajería dirigida del Olimpo (coordinador -> worker).
//   1-1 PRIVADO:  node swarm/pike-tell.mjs W1 "mensaje"      -> escribe solo en inbox-Pike-W1 (nadie mas lo ve)
//   BROADCAST:    node swarm/pike-tell.mjs all "mensaje"     -> fan-out a todos los inbox-Pike-* existentes
// El nombre acepta "W1", "Pike-W1" o el inbox completo "inbox-Pike-W1".
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'C:/Users/fabia/.pi/olimpo';
const SELF = process.env.OLIMPO_NAME || 'Pike-R42A';
const target = process.argv[2];
const msg = process.argv.slice(3).join(' ');
if (!target || !msg) { console.log('uso: node swarm/pike-tell.mjs <W1|Pike-W1|all> "mensaje"'); process.exit(1); }

const inboxFor = (name) => {
  if (name.startsWith('inbox-')) return name;
  const full = name.startsWith('Pike-') ? name : `Pike-${name}`;
  return `inbox-${full}`;
};
const write = (ch, m) => {
  const line = `o#${ch}<${SELF}"${m.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n')}`;
  fs.appendFileSync(path.join(BASE, `${ch}.pact`), line + '\n');
  return ch;
};

if (target === 'all') {
  const inboxes = fs.readdirSync(BASE).filter(f => /^inbox-Pike-.*\.pact$/.test(f)).map(f => f.replace(/\.pact$/, ''));
  if (!inboxes.length) { console.log('no hay inboxes de workers (lanza el enjambre primero)'); process.exit(1); }
  for (const ch of inboxes) write(ch, `[BROADCAST] ${msg}`);
  console.log(`broadcast -> ${inboxes.length} inbox(es): ${inboxes.join(', ')}`);
} else {
  const ch = inboxFor(target);
  write(ch, msg);
  console.log(`1-1 privado -> ${ch} (solo ese worker lo ve)`);
}
