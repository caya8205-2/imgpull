import { Command } from 'commander';
import { SUPPORTED_FORMATS, normalizeFormat, processOne, readBatchFile } from './lib.js';

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

export async function runCli(argv) {
  const program = new Command();

  program
    .name('imgpull')
    .description('Download gambar dari URL, auto convert dari webp (atau format lain) ke format pilihan lo. Jalanin tanpa argumen buat mode TUI interaktif.')
    .argument('[urls...]', 'satu atau lebih URL gambar')
    .option('-f, --format <format>', `format output (${SUPPORTED_FORMATS.join(', ')})`, 'png')
    .option('-o, --output <dir>', 'folder output', 'imgpull')
    .option('-n, --name <name>', 'nama file custom (tanpa ekstensi, hanya berlaku kalau 1 URL)')
    .option('-q, --quality <number>', 'quality 1-100 (buat jpg/webp/avif/tiff)', (v) => parseInt(v, 10))
    .option('-b, --batch <file>', 'baca daftar URL dari file teks (satu URL per baris)')
    .action(async (urls, opts) => {
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

      const runOpts = { format, output: opts.output, name, quality: opts.quality };

      let ok = 0;
      let fail = 0;
      for (const url of allUrls) {
        log('GET', c.cyan, url);
        try {
          // eslint-disable-next-line no-await-in-loop
          const result = await processOne(url, runOpts);
          const sizeKb = (result.sizeBytes / 1024).toFixed(1);
          const tag = result.usedConversion
            ? c.yellow(`${result.sourceExt} -> ${result.targetFormat}`)
            : c.dim('no conversion needed');
          log('OK', c.green, `${result.outPath} ${c.dim(`(${sizeKb} KB, ${tag})`)}`);
          ok += 1;
        } catch (err) {
          log('ERR', c.red, `${url} -> ${err.message}`);
          fail += 1;
        }
      }

      console.log('');
      log('DONE', c.cyan, `${ok} berhasil, ${fail} gagal.`);
      if (fail > 0) process.exitCode = 1;
    });

  await program.parseAsync(argv);
}