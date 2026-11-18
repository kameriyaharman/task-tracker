// Tiny download page for the Android APK.
const http = require('http');
const fs = require('fs');
const path = require('path');

const apk = path.join(__dirname, 'keshav.apk');
const size = (fs.statSync(apk).size / 1048576).toFixed(1);
const built = fs.statSync(apk).mtime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

const page = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Keshav app — download</title>
<style>body{margin:0;font-family:system-ui,sans-serif;background:#2B1A10;color:#F6EAD3;display:grid;place-items:center;min-height:100vh}
.c{background:#FBF7F1;color:#2A1A10;border-radius:20px;padding:32px;max-width:380px;text-align:center}
h1{font-family:Georgia,serif;letter-spacing:.08em;color:#6B3A1C;margin:.2em 0}small{color:#8A7663;letter-spacing:.12em;font-size:10px}
a.b{display:block;margin:22px 0 12px;background:linear-gradient(135deg,#D4A24C,#A8722C);color:#fff;text-decoration:none;padding:15px;border-radius:12px;font-weight:600}
p{font-size:13px;color:#8A7663;line-height:1.5}</style></head><body><div class="c">
<h1>KESHAV</h1><small>ARCHITECTURAL · HARDWARE · PAINT · ELECTRICAL</small>
<a class="b" href="/keshav.apk">Download Android app (${size} MB)</a>
<p>After downloading, open the file and allow “Install unknown apps” for your browser when asked.<br>Built ${built}</p></div></body></html>`;

http.createServer((req, res) => {
  if (req.url.startsWith('/keshav.apk')) {
    res.writeHead(200, {
      'Content-Type': 'application/vnd.android.package-archive',
      'Content-Disposition': 'attachment; filename="keshav.apk"',
      'Content-Length': fs.statSync(apk).size,
    });
    return fs.createReadStream(apk).pipe(res);
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(page);
}).listen(process.env.PORT || 3000);
