const isDebug =
  typeof process !== 'undefined' &&
  process.env.NEXT_PUBLIC_DEBUG === 'true';

export const logger = {
  log: isDebug ? console.log.bind(console) : () => {},
  warn: isDebug ? console.warn.bind(console) : () => {},
  error: console.error.bind(console),
};
