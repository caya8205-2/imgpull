import readline from 'node:readline';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { execSync } from 'node:child_process';
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
    .description('Download gambar dari URL, auto convert dari webp (atau format lain) ke format pilihan lo. Jalanin tanpa argumen buat mode TUI interaktif.')
    .version(CURRENT_VERSION, '-v, --version', 'tampilkan versi saat ini')
    .argument('[urls...]', 'satu atau lebih URL gambar')
    .option('-f, --format <format>', `format output (${SUPPORTED_FORMATS.join(', ')})`, 'png')
    .option('-o, --output <dir>', 'folder output (default: imgpull, atau dari -s)')
    .option('-n, --name <name>', 'nama file custom (tanpa ekstensi, hanya berlaku kalau 1 URL)')
    .option('-q, --quality <number>', 'quality 1-100 (buat jpg/webp/avif/tiff)', (v) => parseInt(v, 10))
    .option('-s, --set-default <dir>', 'simpan folder output bawaan ke config')
    .option('-a, --all', 'download semua gambar (buat IG carousel)')
    .option('--first', 'download gambar pertama saja (default buat IG post)')
    .option('-c, --cookies <file>', 'file cookie Netscape (.txt) buat login IG')
    .option('--set-cookie <file>', 'simpan path cookie default ke config')
    .option('-b, --batch <file>', 'baca daftar URL dari file teks (satu URL per baris)')
    .action(async (urls, opts) => {
      // 1. Handle config setters
      if (opts.setDefault) {
        const saved = saveDefaultOutput(opts.setDefault);
        log('OK', c.green, `Default output disimpan ke: ${saved}`);
        if (urls.length === 0 && !opts.batch) return;
      }

      if (opts.setCookie || (opts.cookies && urls.length === 0 && !opts.batch)) {
        const cookiePath = opts.setCookie || opts.cookies;
        try {
          const saved = saveDefaultCookies(cookiePath);
          log('OK', c.green, `Default cookie IG disimpan ke: ${saved}`);
        } catch (err) {
          log('ERR', c.red, err.message);
          process.exitCode = 1;
        }
        if (urls.length === 0 && !opts.batch) return;
      }

      const format = normalizeFormat(opts.format);
      if (!SUPPORTED_FORMATS.includes(format)) {
        log('ERR', c.red, `Format "${format}" gak didukung. Pilihan: ${SUPPORTED_FORMATS.join(', ')}`);
        process.exitCode = 1;
        return;
      }

      let allUrls = [...urls];
      if (opts.batch) {
        allUrls = allUrls.concat(readBatchFile(opts.batch));
      }

      if (allUrls.length === 0) {
        log('ERR', c.red, 'Gak ada URL. Kasih URL langsung, pake --batch <file>, atau jalanin tanpa argumen buat mode TUI.');
        process.exitCode = 1;
        return;
      }

      let name = opts.name;
      if (allUrls.length > 1 && name) {
        log('WARN', c.yellow, '--name diabaikan karena ada lebih dari 1 URL, nama diambil dari tiap URL.');
        name = null;
      }

      const hasInstagram = allUrls.some(isInstagramPostUrl);
      let allImages = Boolean(opts.all);

      // If interactive terminal and has IG URL, but user didn't specify --all or --first
      if (hasInstagram && !opts.all && !opts.first && process.stdin.isTTY) {
        console.log(c.cyan('\n[?] Postingan Instagram terdeteksi:'));
        console.log('  1. Gambar pertama saja (Cover/Thumbnail — Cepat & tanpa cookie)');
        console.log('  2. Semua gambar carousel (Semuanya — Butuh cookie login)');
        const choice = await askQuestion(c.yellow('Pilih opsi [1/2] (default: 1): '));
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
          log('WARN', c.yellow, `Gagal membaca cookie file (${cookieFile}): ${err.message}`);
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
          ? `${url} ${c.dim(`(ig post ${extractShortcode(url)}${allImages ? ', mode: semua' : ', mode: pertama'})`)}`
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
      log('DONE', c.cyan, `${ok} berhasil, ${fail} gagal.`);
      if (fail > 0) process.exitCode = 1;
    });

  program
    .command('uninstall')
    .description('Hapus imgpull dari sistem (untuk instalasi standalone non-npm)')
    .action(async () => {
      if (process.platform === 'win32') {
        const appDir = path.join(process.env.LOCALAPPDATA || '', 'imgpull');
        const exeDir = path.dirname(process.execPath);

        if (path.resolve(exeDir) !== path.resolve(appDir)) {
          log('ERR', c.red, 'imgpull tidak terinstal melalui installer resmi.');
          log('INFO', c.cyan, 'Jika memakai npm, jalankan: npm uninstall -g imgpull');
          log('INFO', c.cyan, 'Atau cari lokasinya dengan: Get-Command imgpull');
          return;
        }

        log('WARN', c.yellow, 'Tindakan ini akan menghapus imgpull dari sistem.');
        const answer = await askQuestion('Lanjutkan? [y/N]: ');
        if (!answer.toLowerCase().startsWith('y')) {
          log('INFO', c.cyan, 'Dibatalkan.');
          return;
        }

        try {
          execSync(
            `powershell -Command "$p=[Environment]::GetEnvironmentVariable('PATH','User');$p=($p -split ';'|?{$_ -ne '${appDir.replace(/'/g, "''")}'})-join';';[Environment]::SetEnvironmentVariable('PATH',$p,'User')"`,
            { stdio: 'pipe' }
          );
          log('OK', c.green, 'Dihapus dari User PATH.');
        } catch (err) {
          log('WARN', c.yellow, `Gagal update PATH: ${err.message}`);
        }

        const tmpScript = path.join(os.tmpdir(), 'imgpull-cleanup.bat');
        const batContent =
          '@echo off\r\n' +
          'ping 127.0.0.1 -n 3 > nul\r\n' +
          'rmdir /s /q "' + appDir + '"\r\n' +
          'del "' + tmpScript + '"\r\n';
        fs.writeFileSync(tmpScript, batContent, 'utf-8');
        execSync(`start /B "" "${tmpScript}"`, { stdio: 'ignore' });

        log('OK', c.green, 'imgpull akan dihapus setelah terminal ini ditutup.');
        log('INFO', c.cyan, 'Silakan tutup jendela terminal ini.');
      } else {
        const binFile = path.join(os.homedir(), '.local', 'bin', 'imgpull');
        const exeDir = path.dirname(process.execPath);

        if (path.resolve(exeDir) !== path.resolve(path.dirname(binFile))) {
          log('ERR', c.red, 'imgpull tidak terinstal melalui installer resmi.');
          log('INFO', c.cyan, 'Jika memakai npm, jalankan: npm uninstall -g imgpull');
          log('INFO', c.cyan, 'Atau cari lokasinya dengan: which imgpull');
          return;
        }

        log('WARN', c.yellow, 'Tindakan ini akan menghapus imgpull dari sistem.');
        const answer = await askQuestion('Lanjutkan? [y/N]: ');
        if (!answer.toLowerCase().startsWith('y')) {
          log('INFO', c.cyan, 'Dibatalkan.');
          return;
        }

        try {
          if (fs.existsSync(binFile)) {
            fs.unlinkSync(binFile);
            log('OK', c.green, `Berhasil menghapus ${binFile}`);
          }
        } catch (err) {
          log('ERR', c.red, `Gagal menghapus file binary: ${err.message}`);
        }
        log('OK', c.green, 'imgpull berhasil di-uninstall.');
      }
    });

  await program.parseAsync(argv);
}
