import readline from 'node:readline';
import { Command } from 'commander';
import { SUPPORTED_FORMATS, normalizeFormat, processOne, readBatchFile } from './lib.js';
import { extractShortcode, isInstagramPostUrl, parseNetscapeCookies } from './instagram.js';
import {
  getDefaultOutput,
  saveDefaultOutput,
  getDefaultCookies,
  saveDefaultCookies,
} from './config.js';
import { checkForUpdates, CURRENT_VERSION } from './updater.js';

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
};

function log(prefix, color, msg) {
  console.log(`${color(`[${prefix}]`)} ${msg}`);
}

function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans.trim());
    });
  });
}

export async function runCli(argv) {
  const updateInfo = await checkForUpdates();
  if (updateInfo) {
    console.log(`${c.yellow('[UPDATE]')} v${updateInfo.latest} is available (current: v${updateInfo.current})`);
    console.log(`${c.cyan('[INFO]')}   Run: ${updateInfo.command}\n`);
  }

  const program = new Command();

  program
    .name('imgpull')
    .description('Download images from URLs and auto-convert from webp (or any format) to your choice. Run without arguments for interactive TUI mode.')
    .version(CURRENT_VERSION, '-v, --version', 'output the current version')
    .argument('[urls...]', 'one or more image URLs')
    .option('-f, --format <format>', `output format (${SUPPORTED_FORMATS.join(', ')})`, 'png')
    .option('-o, --output <dir>', 'output folder (default: imgpull, or from -s)')
    .option('-n, --name <name>', 'custom file name (without extension, applies to single URL only)')
    .option('-q, --quality <number>', 'quality 1-100 (for jpg/webp/avif/tiff)', (v) => parseInt(v, 10))
    .option('-s, --set-default <dir>', 'save default output directory to config')
    .option('-a, --all', 'download all images (for Instagram carousel)')
    .option('--first', 'download first image only (default for Instagram posts)')
    .option('-c, --cookies <file>', 'Netscape cookies file (.txt) for Instagram login')
    .option('--set-cookie <file>', 'save default cookie file path to config')
    .option('-b, --batch <file>', 'read URL list from a text file (one URL per line)')
    .action(async (urls, opts) => {
      // 1. Handle config setters
      if (opts.setDefault) {
        const saved = saveDefaultOutput(opts.setDefault);
        log('OK', c.green, `Default output saved to: ${saved}`);
        if (urls.length === 0 && !opts.batch) return;
      }

      if (opts.setCookie || (opts.cookies && urls.length === 0 && !opts.batch)) {
        const cookiePath = opts.setCookie || opts.cookies;
        try {
          const saved = saveDefaultCookies(cookiePath);
          log('OK', c.green, `Default Instagram cookie saved to: ${saved}`);
        } catch (err) {
          log('ERR', c.red, err.message);
          process.exitCode = 1;
        }
        if (urls.length === 0 && !opts.batch) return;
      }

      const format = normalizeFormat(opts.format);
      if (!SUPPORTED_FORMATS.includes(format)) {
        log('ERR', c.red, `Format "${format}" is not supported. Options: ${SUPPORTED_FORMATS.join(', ')}`);
        process.exitCode = 1;
        return;
      }

      let allUrls = [...urls];
      if (opts.batch) {
        allUrls = allUrls.concat(readBatchFile(opts.batch));
      }

      if (allUrls.length === 0) {
        log('ERR', c.red, 'No URLs provided. Provide a URL, use --batch <file>, or run without arguments for TUI mode.');
        process.exitCode = 1;
        return;
      }

      let name = opts.name;
      if (allUrls.length > 1 && name) {
        log('WARN', c.yellow, '--name ignored because multiple URLs were provided; names will be derived from URLs.');
        name = null;
      }

      const hasInstagram = allUrls.some(isInstagramPostUrl);
      let allImages = Boolean(opts.all);

      // If interactive terminal and has IG URL, but user didn't specify --all or --first
      if (hasInstagram && !opts.all && !opts.first && process.stdin.isTTY) {
        console.log(c.cyan('\n[?] Instagram post detected:'));
        console.log('  1. First image only (Cover / Thumbnail — fast, no cookies needed)');
        console.log('  2. All carousel slides (All — requires login cookies)');
        const choice = await askQuestion(c.yellow('Choose option [1/2] (default: 1): '));
        if (choice === '2') {
          allImages = true;
        }
        console.log('');
      }

      const cookieFile = opts.cookies || getDefaultCookies();
      let resolvedCookies = null;
      if (cookieFile) {
        try {
          resolvedCookies = parseNetscapeCookies(cookieFile);
        } catch (err) {
          log('WARN', c.yellow, `Failed to read cookie file (${cookieFile}): ${err.message}`);
        }
      }

      const output = opts.output || getDefaultOutput() || 'imgpull';
      const runOpts = {
        format,
        output,
        name,
        quality: opts.quality,
        allImages,
        cookies: resolvedCookies,
      };

      let ok = 0;
      let fail = 0;

      for (const url of allUrls) {
        const isIg = isInstagramPostUrl(url);
        const label = isIg
          ? `${url} ${c.dim(`(ig post ${extractShortcode(url)}${allImages ? ', mode: all' : ', mode: first'})`)}`
          : url;
        log('GET', c.cyan, label);

        try {
          // eslint-disable-next-line no-await-in-loop
          const fileResults = await processOne(url, runOpts);
          for (const result of fileResults) {
            const sizeKb = (result.sizeBytes / 1024).toFixed(1);
            const tag = result.usedConversion
              ? c.yellow(`${result.sourceExt} -> ${result.targetFormat}`)
              : c.dim('no conversion needed');
            const src = result.sourceLabel ? ` ${c.dim(`(${result.sourceLabel})`)}` : '';
            log('OK', c.green, `${result.outPath} ${c.dim(`(${sizeKb} KB, ${tag})`)}${src}`);
            if (result.warning) {
              log('WARN', c.yellow, result.warning);
            }
            ok += 1;
          }
        } catch (err) {
          log('ERR', c.red, `${url} -> ${err.message}`);
          fail += 1;
        }
      }

      console.log('');
      log('DONE', c.cyan, `${ok} succeeded, ${fail} failed.`);
      if (fail > 0) process.exitCode = 1;
    });

  await program.parseAsync(argv);
}
