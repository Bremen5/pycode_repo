// パスとファイル入出力の共通処理
import { readFile, writeFile, mkdir, readdir, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// テストや検証用に、データ・下書き・出力先を環境変数で差し替えられるようにする
export function paths() {
  const data = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
  return {
    root: ROOT,
    raw: path.join(data, 'raw'),
    weekly: path.join(data, 'weekly'),
    markets: path.join(data, 'markets'),
    weeklyContent: process.env.WEEKLY_CONTENT_DIR
      ? path.resolve(process.env.WEEKLY_CONTENT_DIR)
      : path.join(ROOT, 'content/weekly'),
    guideContent: path.join(ROOT, 'content/guide'),
    pagesContent: path.join(ROOT, 'content/pages'),
    templates: path.join(ROOT, 'src/templates'),
    assets: path.join(ROOT, 'src/assets'),
    dist: process.env.DIST_DIR ? path.resolve(process.env.DIST_DIR) : path.join(ROOT, 'dist'),
  };
}

export async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

export async function writeJson(file, obj) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(obj, null, 2) + '\n');
}

export async function writeText(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text);
}

export async function listFiles(dir, ext) {
  if (!existsSync(dir)) return [];
  return (await readdir(dir)).filter((f) => f.endsWith(ext)).sort();
}

/** 'YYYY-MM-DD.json' のような週ファイルの日付一覧（昇順） */
export async function listWeeks(dir, ext) {
  return (await listFiles(dir, ext))
    .map((f) => f.slice(0, -ext.length))
    .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s));
}

/** スクリプトとして直接実行されたか */
export function isMain(importMetaUrl) {
  return process.argv[1] && importMetaUrl === pathToFileURL(path.resolve(process.argv[1])).href;
}

/** GitHub Actions の出力（ローカル実行時は何もしない） */
export async function setActionOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

export { existsSync };
