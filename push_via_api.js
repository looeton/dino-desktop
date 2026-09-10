// 通过 curl 直发 GitHub Git Data API，避开 gh CLI 对空仓库的限制
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = process.cwd();
const OWNER = 'looeton';
const REPO = 'dino-desktop';
const BRANCH = 'main';
const TAG = 'v1.0.0';

const PY = 'C:/Users/ROG/.workbuddy/binaries/python/versions/3.13.12/python.exe';
const TOK = execFileSync(PY, ['-c',
  "import winreg;k=winreg.OpenKey(winreg.HKEY_CURRENT_USER,'Environment');print(winreg.QueryValueEx(k,'GH_TOKEN')[0])"
], { encoding: 'utf8' }).trim();

const API = 'https://api.github.com';
const TMP_DIR = require('os').tmpdir();

function api(method, pathName, body) {
  const args = [
    '-sS',
    '-X', method,
    '-H', `Authorization: token ${TOK}`,
    '-H', 'Accept: application/vnd.github+json',
    '-H', 'X-GitHub-Api-Version: 2022-11-28',
    '-H', 'User-Agent: dino-push-script',
  ];
  if (body !== undefined) {
    const tmp = path.join(TMP_DIR, `dino-push-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`);
    fs.writeFileSync(tmp, JSON.stringify(body));
    args.push('--data-binary', `@${tmp}`);
  }
  args.push(`${API}${pathName}`);
  const out = execFileSync('curl', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (!out) return null;
  try { return JSON.parse(out); }
  catch (e) { throw new Error(`Bad JSON from ${pathName}: ${out.slice(0, 300)}`); }
}

const IGNORE_DIRS = new Set(['.git', 'node_modules', 'dist', 'out', '.cache']);
function collectFiles() {
  const out = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (!IGNORE_DIRS.has(e.name)) walk(full); }
      else out.push(full);
    }
  })(ROOT);
  return out;
}

function main() {
  const files = collectFiles();
  console.log('files:', files.length);

  // 1. blobs
  const treeItems = [];
  for (const full of files) {
    const rel = path.relative(ROOT, full).replace(/\\/g, '/');
    const content = fs.readFileSync(full);
    const isBinary = /\.(png|ico|icns|jpg|jpeg|gif|woff2?)$/i.test(rel);
    const body = {
      content: isBinary ? content.toString('base64') : Buffer.from(content).toString('base64'),
      encoding: 'base64',
    };
    const r = api('POST', `/repos/${OWNER}/${REPO}/git/blobs`, body);
    if (!r || !r.sha) throw new Error('blob failed for ' + rel + ': ' + JSON.stringify(r).slice(0, 200));
    treeItems.push({ path: rel, mode: '100644', type: 'blob', sha: r.sha });
    process.stdout.write('.');
  }
  process.stdout.write('\n');

  // 2. tree
  const tree = api('POST', `/repos/${OWNER}/${REPO}/git/trees`, { tree: treeItems });
  console.log('tree:', tree.sha);

  // 3. commit
  const commit = api('POST', `/repos/${OWNER}/${REPO}/git/commits`, {
    tree: tree.sha,
    message: 'feat: initial release v1.0.0 - cross-platform desktop port of Chrome dino',
  });
  console.log('commit:', commit.sha);

  // 4. main ref
  api('POST', `/repos/${OWNER}/${REPO}/git/refs`, { ref: `refs/heads/${BRANCH}`, sha: commit.sha });
  console.log('main OK');

  // 5. tag
  api('POST', `/repos/${OWNER}/${REPO}/git/refs`, { ref: `refs/tags/${TAG}`, sha: commit.sha });
  console.log('tag OK');
  console.log('\nDONE. CI 即将启动三平台构建。');
}

main();
