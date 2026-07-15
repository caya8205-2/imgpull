#!/usr/bin/env node

import { runTui } from '../src/ui.js';
import { runCli } from '../src/cli.js';

const args = process.argv.slice(2);

if (args.length === 0) {
  runTui();
} else {
  runCli(process.argv).catch((err) => {
    console.error(`[FATAL] ${err.stack || err.message}`);
    process.exit(1);
  });
}