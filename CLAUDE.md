# CLAUDE.md — 毎週の運用手順

このリポジトリは、EIA週間石油在庫統計の日本語解説サイトです。
「データ取得〜下書き」は GitHub Actions が自動で行い、「仕上げと公開判断」は人が行います。

## 「今週の解説を仕上げて」と依頼されたら

次の順で作業する。

1. **develop ブランチを最新にし、最新週のデータと下書きを確認する**
   - `git fetch origin && git checkout develop && git pull origin develop`
   - 最新週は `data/weekly/` の最も新しい `YYYY-MM-DD.json`、下書きは `content/weekly/YYYY-MM-DD.md`
   - 下書きが無い場合は、GitHub Actions（fetch-weekly）の実行結果を確認し、その旨を報告して止まる
2. **数値を data/weekly の最新ファイルと照合し、下書きに誤りがないか確認する**
   - `series.<key>.value / change / yoyPct / pctAvg5 / rangePos` などと本文の数字を1つずつ照合する
   - 単位：在庫は千バレル（MBBL）、流量は千バレル/日（MBBL/D）、稼働率は%。「万バレル」は千バレル÷10
   - キロリットル換算は 1バレル＝158.987294928リットル
   - 「価格と市場」の段落は `markets.prices / markets.derived / markets.cftc` と照合する（価格はドル、CFTCは枚。1枚＝1,000バレル）
   - `markets` が null の週は、価格・建玉の取得に失敗している。`npm run fetch:markets && npm run markets && node scripts/analyze.mjs --force --weeks 1` で作り直してから照合する
3. **下書きを自然な日本語の解説（800〜1,200字）に仕上げる。冒頭は3行の要約**
   - 3行の要約はフロントマターの `summary`（ちょうど3項目）に書く。本文の文字数に要約は含めない
   - 下書きの機械的な文の羅列を、読みやすい文章に整理する（主要項目：原油・ガソリン・留出油・稼働率を中心に）
   - `title` は「EIA原油在庫 YYYY年M月D日週｜前週比〇〇万バレル減（増）」の形を保つ
   - `description` は120字程度で内容を要約する
4. **変化が大きい項目の背景を、公開されている情報の範囲で補足する。出典がない推測は書かない**
   - 「注目」「変化大」になった項目（`highlight: true` / `bigMove: true`）が対象
   - EIAの週報本文（https://www.eia.gov/petroleum/supply/weekly/ ）など、確認できる情報だけを出典リンク付きで書く
   - 確認できない場合は背景の節を削除する（推測で埋めない）
5. **投資助言にあたる表現がないか確認する**
   - 禁止：売買の推奨やタイミング（「買い」「売り時」「〜すべき」）、価格の予想・断定（「上昇するだろう」「下落は必至」）
   - 事実とデータの説明にとどめる（「〜した」「〜を上回った」）。相場への影響に触れる場合も断定しない
   - 価格の変動理由を在庫の増減だけで説明しない（「在庫が減ったので価格が上がった」と因果を断定しない）
   - CFTCの建玉は「投機筋が強気」などの評価語を使わず、買い越しの枚数と増減の事実だけを書く
6. **【要確認】の印と下書きのフラグを外し、`npm run build` と `npm test` を実行する**
   - 本文冒頭の「> 【要確認】 この解説は…」の行は丸ごと削除する。ほかの【要確認】もすべて消す
   - フロントマターを `draft: false` にする。公開日を `date: YYYY-MM-DD`（日本時間）で追加する
   - `npm run build` の出力に、その週が「下書きのため出力しません」と出ないことを確認する
   - 必要なら `npm run preview` で `dist-preview/` を作り、表示を確認する
7. **差分を私に見せて承認を得てから、develop を main にマージして push する**
   - `git diff` で差分を提示し、承認されるまでコミット・マージ・push をしない
   - 承認後：develop にコミット → `git checkout main && git pull origin main && git merge --no-ff develop && git push origin main`
   - main への push で Netlify が本番を更新する

## 構成メモ

- `config/series.mjs` 取得する系列（ID・日本語名）の一元管理
- `config/site.mjs` サイト名・URL・GA4 ID・広告枠・運営者情報
- `config/markets.mjs` 価格・CFTC・STEO の系列定義と、自動取得していない外部指標の一覧
- `scripts/fetch.mjs` → `fetch-markets.mjs` → `markets.mjs` → `analyze.mjs` → `draft.mjs` → `build.mjs` の順に処理する
- `study/` は監修者用の学習テキスト（非公開。ビルドには含まれない）
- `draft: true` の週、または【要確認】が残っている週はビルドで出力されない
- 自動処理が触るのは `data/` と `content/weekly/` だけ。人が仕上げた `content/weekly/*.md` は上書きされない

## してはいけないこと

- main ブランチへ直接コミットしない（承認後に develop からマージする）
- APIキーをコードやコミットに書かない（`EIA_API_KEY` は環境変数／GitHub Secrets）
- `data/weekly/*.json` の数値を手で書き換えない（誤りがあれば `node scripts/analyze.mjs --force` で作り直す）
- テストを無効化・スキップしない
