#!/usr/bin/env bash
# Netlify の ignore コマンド。exit 0 = ビルドをスキップ（クレジットを消費しない）、exit 1 = ビルドする。
set -u

# 本番（main ブランチ）以外はビルドしない（デプロイプレビュー・ブランチデプロイを止める）
if [ "${CONTEXT:-}" != "production" ]; then
  echo "[ignore] CONTEXT=${CONTEXT:-unknown}: 本番以外のためスキップ"
  exit 0
fi

# 初回や前回のコミットが分からない場合はビルドする
if [ -z "${CACHED_COMMIT_REF:-}" ] || [ "${CACHED_COMMIT_REF}" = "${COMMIT_REF:-}" ]; then
  echo "[ignore] 前回のコミットが不明のためビルド"
  exit 1
fi

# サイトの表示に関係しないファイルだけの変更ならスキップ
# （git diff が失敗した場合は 0 以外になり、安全側でビルドされる）
if git diff --quiet "$CACHED_COMMIT_REF" "$COMMIT_REF" -- . \
  ':(exclude)*.md' \
  ':(exclude)docs/' \
  ':(exclude)tests/' \
  ':(exclude)scripts/*.mjs' \
  ':(exclude)scripts/*.py' \
  ':(exclude)package.json' \
  ':(exclude)kabu.py' \
  ':(exclude).gitignore'; then
  echo "[ignore] ドキュメント・テストのみの変更のためスキップ"
  exit 0
fi

echo "[ignore] サイトに関係する変更があるためビルド"
exit 1
