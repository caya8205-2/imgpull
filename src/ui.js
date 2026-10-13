import React, { useState, useEffect } from 'react';
import { render, Box, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import Spinner from 'ink-spinner';
import { LOSSY_FORMATS, processOne } from './lib.js';
import { isInstagramPostUrl, parseNetscapeCookies } from './instagram.js';
import { getDefaultOutput, getDefaultCookies, saveDefaultCookies } from './config.js';
import { checkForUpdates } from './updater.js';

const h = React.createElement;

const FORMAT_ITEMS = [
  { label: 'png   (lossless, transparansi)', value: 'png' },
  { label: 'jpg   (lossy, gak ada transparansi)', value: 'jpg' },
  { label: 'webp  (lossy/lossless, modern)', value: 'webp' },
  { label: 'avif  (lossy, paling kecil)', value: 'avif' },
  { label: 'tiff  (lossless, buat editing)', value: 'tiff' },
  { label: 'gif   (animasi/palette terbatas)', value: 'gif' },
];

const IG_SCOPE_ITEMS = [
  { label: 'Gambar pertama saja (Cover / Thumbnail — Cepat & tanpa cookie)', value: 'first' },
  { label: 'Semua gambar carousel (Semuanya — Butuh cookie login IG)', value: 'all' },
];

function Header({ updateInfo }) {
  return h(
    Box,
    { flexDirection: 'column', marginBottom: 1 },
    h(
      Box,
      { borderStyle: 'round', borderColor: 'cyan', paddingX: 2 },
      h(Text, { color: 'cyan', bold: true }, 'imgpull'),
      h(Text, { dimColor: true }, '  — download & convert gambar dari URL'),
    ),
    updateInfo
      ? h(
          Box,
          { borderStyle: 'single', borderColor: 'yellow', paddingX: 1, marginTop: 1, flexDirection: 'column' },
          h(Text, { color: 'yellow', bold: true }, `★ Update v${updateInfo.latest} tersedia! (versi saat ini: v${updateInfo.current})`),
          h(Text, { color: 'cyan' }, `  Jalankan: ${updateInfo.command}`),
        )
      : null,
  );
}

function StatusIcon({ status }) {
  if (status === 'queued') return h(Text, { dimColor: true }, '○');
  if (status === 'downloading') return h(Text, { color: 'yellow' }, h(Spinner, { type: 'dots' }));
  if (status === 'done') return h(Text, { color: 'green' }, '✔');
  if (status === 'error') return h(Text, { color: 'red' }, '✘');
  return h(Text, null, ' ');
}

function App() {
  const { exit } = useApp();

  const [updateInfo, setUpdateInfo] = useState(null);
  const [step, setStep] = useState('urls');
  const [urls, setUrls] = useState([]);
  const [urlInput, setUrlInput] = useState('');
  const [igScope, setIgScope] = useState('first');
  const [cookieInput, setCookieInput] = useState(() => getDefaultCookies() || '');
  const [format, setFormat] = useState('png');
  const [qualityInput, setQualityInput] = useState('');
  const [outputInput, setOutputInput] = useState(() => getDefaultOutput() || 'imgpull');
  const [results, setResults] = useState([]);
  const [started, setStarted] = useState(false);

  useInput((input, key) => {
    if (step === 'done' && (key.return || input === 'q')) {
      exit();
    }
  });

  useEffect(() => {
    checkForUpdates().then((info) => {
      if (info) setUpdateInfo(info);
    });
  }, []);

  useEffect(() => {
    if (step !== 'downloading' || started) return;
    setStarted(true);
    setResults(urls.map((url) => ({ url, status: 'queued', files: [] })));

    (async () => {
      const quality = qualityInput ? parseInt(qualityInput, 10) : undefined;
      const allImages = igScope === 'all';
      let resolvedCookies = null;
      if (cookieInput && cookieInput.trim()) {
        try {
          resolvedCookies = parseNetscapeCookies(cookieInput.trim());
        } catch {
          // ignore error, will fall back
        }
      }

      for (let i = 0; i < urls.length; i += 1) {
        const url = urls[i];
        setResults((prev) => prev.map((r, idx) => (idx === i ? { ...r, status: 'downloading' } : r)));
        try {
          // eslint-disable-next-line no-await-in-loop
          const fileResults = await processOne(url, {
            format,
            output: outputInput,
            quality,
            allImages,
            cookies: resolvedCookies,
          });

          setResults((prev) =>
            prev.map((r, idx) => (idx === i ? { ...r, status: 'done', files: fileResults } : r)),
          );
        } catch (err) {
          setResults((prev) =>
            prev.map((r, idx) => (idx === i ? { ...r, status: 'error', message: err.message } : r)),
          );
        }
      }
      setStep('done');
    })();
  }, [step, started, urls, format, qualityInput, outputInput, igScope, cookieInput]);

  const handleUrlSubmit = (value) => {
    const trimmed = value.trim();
    if (trimmed === '') {
      if (urls.length > 0) {
        const hasIg = urls.some(isInstagramPostUrl);
        if (hasIg) {
          setStep('ig-scope');
        } else {
          setStep('format');
        }
      }
      return;
    }
    setUrls((prev) => [...prev, trimmed]);
    setUrlInput('');
  };

  const handleIgScopeSelect = (item) => {
    setIgScope(item.value);
    if (item.value === 'all' && !getDefaultCookies()) {
      setStep('ig-cookie');
    } else {
      setStep('format');
    }
  };

  const handleCookieSubmit = (value) => {
    const trimmed = value.trim();
    if (trimmed) {
      setCookieInput(trimmed);
      try {
        saveDefaultCookies(trimmed);
      } catch {
        // optional save
      }
    }
    setStep('format');
  };

  const handleFormatSelect = (item) => {
    setFormat(item.value);
    const sharpFormat = item.value === 'jpg' ? 'jpeg' : item.value;
    setStep(LOSSY_FORMATS.includes(sharpFormat) ? 'quality' : 'output');
  };

  const handleQualitySubmit = (value) => {
    setQualityInput(value.trim());
    setStep('output');
  };

  const handleOutputSubmit = (value) => {
    setOutputInput(value.trim() || 'imgpull');
    setStep('downloading');
  };

  const children = [h(Header, { key: 'header', updateInfo })];

  if (step === 'urls') {
    children.push(
      h(Box, { key: 'urls-list', flexDirection: 'column', marginBottom: 1 },
        urls.length === 0
          ? h(Text, { dimColor: true }, 'Belum ada URL ditambahin.')
          : urls.map((u, i) => h(Text, { key: i }, h(Text, { color: 'green' }, '+ '), u)),
      ),
      h(Box, { key: 'urls-input' },
        h(Text, { color: 'cyan' }, urls.length === 0 ? 'URL gambar: ' : 'URL lagi (Enter kosong buat lanjut): '),
        h(TextInput, { value: urlInput, onChange: setUrlInput, onSubmit: handleUrlSubmit }),
      ),
    );
  } else if (step === 'ig-scope') {
    children.push(
      h(Box, { key: 'ig-scope-box', flexDirection: 'column', marginBottom: 1 },
        h(Text, { color: 'yellow', bold: true }, 'Postingan Instagram terdeteksi!'),
        h(Text, { color: 'cyan', marginBottom: 1 }, 'Mau download gambar pertama atau semuanya?'),
        h(SelectInput, { items: IG_SCOPE_ITEMS, onSelect: handleIgScopeSelect }),
      ),
    );
  } else if (step === 'ig-cookie') {
    children.push(
      h(Box, { key: 'ig-cookie-box', flexDirection: 'column' },
        h(Text, { color: 'cyan' }, 'Path file cookie Netscape (.txt) untuk download semua slide carousel:'),
        h(Text, { dimColor: true }, '(Kosongkan / tekan Enter untuk lewati)'),
        h(TextInput, { value: cookieInput, onChange: setCookieInput, onSubmit: handleCookieSubmit }),
      ),
    );
  } else if (step === 'format') {
    children.push(
      h(Text, { key: 'format-label', color: 'cyan' }, `${urls.length} URL siap. Pilih format output:`),
      h(SelectInput, { key: 'format-select', items: FORMAT_ITEMS, onSelect: handleFormatSelect }),
    );
  } else if (step === 'quality') {
    children.push(
      h(Box, { key: 'quality-input' },
        h(Text, { color: 'cyan' }, 'Quality 1-100 (kosongin buat default): '),
        h(TextInput, { value: qualityInput, onChange: setQualityInput, onSubmit: handleQualitySubmit }),
      ),
    );
  } else if (step === 'output') {
    children.push(
      h(Box, { key: 'output-input' },
        h(Text, { color: 'cyan' }, 'Folder output: '),
        h(TextInput, { value: outputInput, onChange: setOutputInput, onSubmit: handleOutputSubmit }),
      ),
    );
  } else if (step === 'downloading' || step === 'done') {
    children.push(
      h(Box, { key: 'progress', flexDirection: 'column', marginBottom: 1 },
        results.map((r, i) =>
          h(Box, { key: i, flexDirection: 'column', marginBottom: 1 },
            h(Box, null,
              h(StatusIcon, { status: r.status }),
              h(Text, null, ' '),
              h(Text, r.status === 'error' ? { color: 'red' } : { color: 'cyan' }, r.url),
            ),
            r.status === 'done' && r.files
              ? r.files.map((f, fi) =>
                  h(Box, { key: fi, marginLeft: 2, flexDirection: 'column' },
                    h(Text, { dimColor: true },
                      `↳ ${f.outPath} (${(f.sizeBytes / 1024).toFixed(1)} KB${f.usedConversion ? `, ${f.sourceExt}->${f.targetFormat}` : ''})`,
                    ),
                    f.warning ? h(Text, { color: 'yellow' }, `  ⚠ ${f.warning}`) : null,
                  ),
                )
              : null,
            r.status === 'error' ? h(Box, { marginLeft: 2 }, h(Text, { color: 'red' }, `✘ ${r.message}`)) : null,
          ),
        ),
      ),
    );
    if (step === 'done') {
      const totalOk = results.reduce((acc, r) => acc + (r.files ? r.files.length : 0), 0);
      const fail = results.filter((r) => r.status === 'error').length;
      children.push(
        h(Text, { key: 'summary', color: 'cyan', bold: true },
          `Selesai: ${totalOk} gambar berhasil diunduh, ${fail} URL gagal.  `,
          h(Text, { dimColor: true }, '(Enter / q buat keluar)'),
        ),
      );
    }
  }

  return h(Box, { flexDirection: 'column' }, ...children);
}

export function runTui() {
  if (!process.stdin.isTTY) {
    console.error('[ERR] Mode TUI butuh terminal interaktif (TTY). Pake mode flag biasa: imgpull <url> -f jpg');
    process.exitCode = 1;
    return;
  }
  render(h(App));
}
