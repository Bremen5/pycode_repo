# EIA石油在庫ウィークリー

米エネルギー情報局（EIA）の週間石油在庫統計（Weekly Petroleum Status Report）を自動で取得し、
日本語の解説とグラフ付きで毎週公開する静的サイトです。

- Node.js（ES Modules）の自作ビルドスクリプト。フレームワーク・外部ライブラリなし（依存パッケージ 0）
- グラフはビルド時に SVG を生成して HTML に埋め込み（JS なしで表示）
- ホスティング：Netlify 無料プラン（main ブランチのみ公開）
- データ取得：GitHub Actions のスケジュール実行 → develop ブランチにコミット

## 運用の流れ

```
[GitHub Actions] 木曜 8:00（JST）  fetch → analyze → draft → develop にコミット
                 金曜 8:00（JST）  再実行（祝日で発表が遅れた週。まだ無ければジョブ失敗で通知）
[人 + Claude]    「今週の解説を仕上げて」→ CLAUDE.md の手順で仕上げ → 承認 → main にマージ
[Netlify]        main の更新を検知して npm run build → dist/ を公開
```

## コマンド

| コマンド | 内容 |
|---|---|
| `npm run fetch` | EIA API から取得（初回は過去10年分、以後は直近8週を取り直して追加）。`EIA_API_KEY` が必要 |
| `npm run analyze` | 最新週の比較データ `data/weekly/YYYY-MM-DD.json` を作成（`-- --weeks 4` で直近4週） |
| `npm run draft` | 下書き `content/weekly/YYYY-MM-DD.md` を作成（`draft: true`・【要確認】付き） |
| `npm run update` | 上の3つを順に実行 |
| `npm run verify-series` | `config/series.mjs` の系列IDを EIA の系列名・単位で照合 |
| `npm run build` | `dist/` に出力（下書きの週は出力しない） |
| `npm run preview` | 下書きも含めて `dist-preview/` に出力（noindex） |
| `npm test` | 単体テスト（node:test） |
| `npx serve dist` | ローカルで表示確認 |

## 初回のセットアップ（ローカル）

```sh
export EIA_API_KEY=xxxxxxxx      # https://www.eia.gov/opendata/register.php で無料登録
npm run verify-series            # 系列IDの確認（すべて OK になること）
npm run fetch                    # 過去10年分を一括取得
node scripts/analyze.mjs --weeks 4
npm run draft                    # 直近4週の下書き
npm run preview && npx serve dist-preview
```

## ディレクトリ

```
data/raw/            EIA API の取得結果（系列ごとの JSON）
data/weekly/         週ごとの比較データ（YYYY-MM-DD.json）
content/weekly/      週ごとの解説（Markdown。自動下書き → 人が仕上げ）
content/guide/       ガイド（固定ページ）
content/pages/       about / privacy / disclaimer
scripts/             fetch / analyze / draft / charts / build と共通処理（lib/）
src/templates/       HTML テンプレート
src/assets/          CSS・ロゴ・OGP画像
config/              系列定義（series.mjs）とサイト設定（site.mjs）
tests/               node:test の単体テスト（合成データを使用）
```

## 比較の計算方法

- **前週比**：7日前の週（±1日）との差
- **前年同週比**：1年前の同じ日付に最も近い週（±3日）との差・増減率
- **過去5年の同じ週**：1〜5年前の各年で、同じ日付に最も近い週（±3日）の値の平均・最大・最小
- **注目**：過去5年の同じ週の範囲（最小〜最大）を外れた場合
- **変化大**：週間の変化が、過去5年の週間変化の標準偏差の2倍以上の場合
- **キロリットル換算**：1バレル＝158.987294928リットル

## 注意

- `assets/` には1年間の長期キャッシュを設定しています。CSS はファイル名にハッシュが入るため自動で更新されますが、
  `logo.svg`・`ogp.png` を差し替えるときはファイル名も変えてください。
- 1ページの合計（HTML＋CSS＋ロゴ）が 300KB を超えるとビルドが失敗します。
