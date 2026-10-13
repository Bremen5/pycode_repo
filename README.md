# お金の計算ツール箱

転職・給与・手取りの無料計算ツールを集めたサイトです。ビルド不要の静的サイト（HTML / CSS / バニラJavaScript の ES Modules）で、Netlify の無料プランで公開します。

- 1本目：[実質年収比較ツール](tools/jisshitsu-nenshu/index.html)（2つの求人を手取り＋福利厚生の「実質年収」「実質時給」で比較）
- 入力値はブラウザ内だけで計算し、外部には送信しません

## ディレクトリ構成

```
/
├── index.html                          # ツール一覧（トップ）
├── tools/<ツール名>/index.html         # 各ツール（1ツール = 1ディレクトリ）
├── assets/css/common.css               # 全ツール共通のスタイル
├── assets/js/site.js                   # サイトURL・GA4のID・アセットのバージョンを一元管理
├── assets/js/calc/*.js                 # 計算ロジック（純粋関数のみ。DOM操作は書かない）
├── assets/js/config/rates-YYYY.js      # 税率・保険料率などの定数（年度ごとに差し替える）
├── assets/js/tools/<ツール名>.js       # 各ツールの画面処理
├── assets/img/                         # 画像（WebP）・favicon
├── tests/*.test.js                     # node:test による単体テスト
├── scripts/                            # 補助スクリプト（公開されない）
├── privacy.html / about.html / 404.html
├── sitemap.xml / robots.txt / netlify.toml
└── README.md
```

## ローカルでの確認

```bash
npx serve .          # http://localhost:3000 で表示を確認
node --test          # 単体テスト（Node.js 20 以上）
node scripts/measure-size.mjs   # ページごとの転送量を計測
```

`file://` で直接開くと ES Modules が読み込めないため、必ずローカルサーバー経由で確認してください。

---

## 運用ルール（Netlify 無料プランのクレジットを節約する）

Netlify の無料プランは **月300クレジット** が上限で、超えるとサイトが停止します。

| 消費するもの | クレジット |
| --- | --- |
| 本番公開 1回 | 15 |
| 転送量 1GB | 20 |
| リクエスト 1万回 | 2 |

### ブランチと公開のルール

1. **本番に公開されるのは `main` ブランチだけ**です（`netlify.toml` の ignore 設定で、main 以外のビルドはスキップされます）。
2. **日々の作業は `develop` ブランチ**で行い、確認はローカル（`npx serve .`）で済ませます。
3. **`main` への反映は週1回程度**にまとめます（月4〜5回 × 15 = 60〜75クレジット）。急ぎの修正（計算の誤りなど）は例外とします。
4. `main` に反映する前に、次を確認します。
   - `node --test` がすべて通る
   - CSS・JS・画像を変えた場合は `node scripts/sync-site.mjs --bump` でバージョンを更新した
   - `node scripts/measure-size.mjs` で、1ページの合計が 500KB 以下
5. `README.md` などのドキュメント、`tests/`、`scripts/` だけの変更は、`main` に入れても公開（ビルド）されません。

```bash
# 例：週1回の反映
git checkout develop
node --test && node scripts/sync-site.mjs --bump
git commit -am "週次の更新"
git checkout main && git merge --no-ff develop && git push origin main
git checkout develop
```

### 転送量を抑えるルール

- 画像は **WebP** で、表示サイズに合わせて圧縮する（OGP画像は 1200×630、品質 70 前後）
- 外部ライブラリは必要最小限にし、使わないものは読み込まない（現在は外部ライブラリ 0）
- CSS・JS・画像は1年キャッシュ（`immutable`）。更新を反映するには、参照に付いている `?v=...` を `sync-site.mjs --bump` で変える
- HTML は5分キャッシュ
- 1ページあたりの合計転送量は **500KB 以下** を目標にする

## Netlify との連携手順（手動）

1. GitHub に**非公開リポジトリ**を作り、このリポジトリを push する（`main` と `develop` の2ブランチ）。
2. [Netlify](https://app.netlify.com/) にログインし、**Add new site → Import an existing project → GitHub** を選ぶ。
3. 非公開リポジトリへのアクセスを Netlify の GitHub App に許可し、このリポジトリを選ぶ。
4. ビルド設定は `netlify.toml` が自動で読み込まれるので、次のとおりになっていることを確認する。
   - Branch to deploy: `main`
   - Build command: 空欄
   - Publish directory: `.`
5. **Deploy** を押して初回公開する。
6. **Site configuration → Site details → Change site name** でサイト名を決める（例：`okane-tools` → `https://okane-tools.netlify.app`）。
7. **Site configuration → Build & deploy → Branches and deploy contexts** で、次のように設定する（クレジットの節約）。
   - Production branch: `main`
   - Branch deploys: **Deploy only the production branch**
   - Deploy Previews: **Don't deploy pull requests**
8. サイトURLを反映する。
   1. `assets/js/site.js` の `url` を、決めたサイトURL（例：`https://okane-tools.netlify.app`）に書き換える
   2. `node scripts/sync-site.mjs --bump` を実行（HTML の canonical・OGP・構造化データ、sitemap.xml、robots.txt が更新される）
   3. コミットして `main` に push
9. GA4 を使う場合は、`assets/js/site.js` の `gaId` を本物の測定ID（`G-` で始まる）に書き換え、同様に `sync-site.mjs --bump` して公開する。プレースホルダー（`G-XXXXXXXXXX`）のままなら計測タグは読み込まれない。
10. [Google Search Console](https://search.google.com/search-console) にサイトを登録し、`/sitemap.xml` を送信する。
11. **Usage / Billing** 画面で、月のクレジット消費量をときどき確認する。

---

## ツールの追加手順

例として「手取りシミュレーション（`tedori`）」を追加する場合：

1. **計算ロジック**：`assets/js/calc/` に純粋関数を書く。既存の `salary.js`（社会保険料・所得税・住民税）を `import` して使い回せる。数値の定数は書かず、引数の `rates` から受け取る。
2. **定数**：新しい税率などが必要なら `assets/js/config/rates-2026.js` に追加し、出典URLと確認日をコメントで残す。
3. **テスト**：`tests/tedori.test.js` を作り、`node --test` で通ることを確認する。
4. **画面処理**：`assets/js/tools/tedori.js` を作る。先頭で `import '../site.js?v=...'` を読み込む（GA4 と共通処理のため）。`localStorage` を使う場合は必ず `try/catch` で囲む。
5. **ページ**：`tools/jisshitsu-nenshu/index.html` を `tools/tedori/index.html` にコピーし、次を書き換える。
   - `title`、`meta description`、canonical、OGP（`og:url`・`og:image`）、構造化データ（WebApplication・FAQPage）
   - フォーム・結果・解説記事・FAQ
   - 広告枠には必ず **「PR」または「広告」** の表記を残す（景品表示法のステマ規制）
   - 「入力値は外部に送信しない」旨と「計算結果は目安です」の注記を残す
6. **OGP画像**：`scripts/make-og-images.py` の `IMAGES` に1行足して `python3 scripts/make-og-images.py` を実行（WebP が生成される）。
7. **一覧とサイトマップ**：`index.html` のツール一覧にカードを追加し、`sitemap.xml` に URL を追加する。`scripts/measure-size.mjs` の `PAGES` にも追加する。
8. **反映**：`node scripts/sync-site.mjs --bump` → `node scripts/measure-size.mjs` → `develop` にコミットし、週次の反映で `main` へ。

外部のスクリプト（広告タグなど）を追加する場合は、`netlify.toml` の `Content-Security-Policy` に配信元のドメインを追加してください。追加しないとブラウザがブロックします。

## 税率・保険料率など定数の年度更新手順

定数はすべて `assets/js/config/rates-YYYY.js` に集約しています。ロジック（`calc/*.js`）には数値を書いていません。

### 毎年の確認スケジュールの目安

| 時期 | 確認するもの | 主な出典 |
| --- | --- | --- |
| 12月〜翌3月 | 税制改正（給与所得控除・基礎控除・税率） | 財務省「税制改正の大綱」、国税庁「源泉所得税の改正のあらまし」 |
| 2〜3月 | 健康保険料率・介護保険料率（3月分から） | 協会けんぽ「都道府県単位保険料率」 |
| 2〜3月 | 子ども・子育て支援金率（4月分から） | 協会けんぽ |
| 3月 | 雇用保険料率（4月から） | 厚生労働省「雇用保険料率のご案内」 |
| 随時 | 厚生年金の標準報酬月額の上限（2027年9月から段階的に引上げ予定） | 日本年金機構 |
| 随時 | 住民税（均等割・基礎控除など） | 総務省、各自治体 |

### 手順

1. `assets/js/config/rates-2026.js` を複製して `rates-2027.js` を作り、`RATES_2026` を `RATES_2027` に、`year` と `label` を書き換える。
2. 上の表の出典を確認し、変わった値を書き換える。**各値の横のコメントの出典URLと確認日も必ず更新する。**
3. `tests/salary.test.js` の `import` を `rates-2027.js` に変え、期待値を新しい料率で計算し直す（計算過程はテストのコメントにある）。`node --test` がすべて通ることを確認する。
4. 画面処理（`assets/js/tools/jisshitsu-nenshu.js`）の `import { RATES_2026 as RATES } from '../config/rates-2026.js?v=...'` を新しいファイルに差し替える。
5. 記事中の「2026年（令和8年）」「9.9%」などの表記と、`title`・`description` の年度を更新する。
6. `node scripts/sync-site.mjs --bump` を実行して `main` に反映する。

### 計算の前提（簡易計算にしている点）

- 健康保険は協会けんぽの全国平均料率を初期値とし、画面で変更できる（健康保険組合の料率を入れてもよい）
- 賞与は年2回に均等に分けて支給される前提で、上限（厚生年金：1回150万円、健康保険：年573万円）を判定
- 扶養は「16歳以上の一般の扶養親族」として計算（配偶者控除の所得制限、特定扶養・老人扶養は考慮しない）
- 住民税は、前年の所得ではなく、入力した条件の同じ年の所得から計算（令和9年度分のルール）。自治体の超過課税・調整控除の細かい区分は簡略化
- 生命保険料控除・iDeCo・医療費控除・ふるさと納税、月60時間超の割増率（1.5倍）は考慮しない
- 2026年分の所得税は、基礎控除の引上げが年末調整で反映される（毎月の源泉徴収額とは異なる）
