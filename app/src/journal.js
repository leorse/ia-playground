import { EventEmitter } from 'node:events';

export const bus = new EventEmitter();
const entrees = [];

export function log(type, details) {
  const e = { id: entrees.length + 1, date: new Date().toISOString(), type, ...details };
  entrees.push(e);
  if (entrees.length > 500) entrees.shift();
  bus.emit('journal', e);
  return e;
}

export const lister = () => entrees.slice(-200);
export const vider = () => { entrees.length = 0; };
