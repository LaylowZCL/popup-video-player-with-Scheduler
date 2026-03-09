const { app } = require('electron');

const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  none: 100,
};

function resolveLevel() {
  const isProduction = process.env.NODE_ENV === 'production' || (!!app && app.isPackaged);
  const fallback = isProduction ? 'warn' : 'debug';
  const raw = (process.env.LOG_LEVEL || fallback).toLowerCase();
  return LEVELS[raw] ? raw : fallback;
}

const currentLevel = resolveLevel();

function canLog(level) {
  return LEVELS[level] >= LEVELS[currentLevel];
}

function toArgs(scope, args) {
  return [`[${scope}]`, ...args];
}

function createLogger(scope) {
  return {
    debug: (...args) => {
      if (!canLog('debug')) return;
      console.debug(...toArgs(scope, args));
    },
    info: (...args) => {
      if (!canLog('info')) return;
      console.info(...toArgs(scope, args));
    },
    warn: (...args) => {
      if (!canLog('warn')) return;
      console.warn(...toArgs(scope, args));
    },
    error: (...args) => {
      if (!canLog('error')) return;
      console.error(...toArgs(scope, args));
    },
    level: currentLevel,
  };
}

module.exports = {
  createLogger,
};
