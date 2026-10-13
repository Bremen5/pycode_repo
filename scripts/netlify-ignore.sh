#!/bin/sh
# Netlify の ignore コマンド（クレジット節約用）
#   exit 0 → ビルドしない / exit 1 → ビルドする
# 本番（main ブランチ）以外はビルドしない
if [ "$CONTEXT" != "production" ] || [ "$BRANCH" != "main" ]; then
  echo "main ブランチ以外（$CONTEXT / $BRANCH）のためビルドしません"
  exit 0
fi
# 初回など比較対象がなければビルドする
if [ -z "$CACHED_COMMIT_REF" ] || [ "$CACHED_COMMIT_REF" = "$COMMIT_REF" ]; then
  exit 1
fi
# サイトに影響するファイルが変わっていなければビルドしない（README・CLAUDE.md・tests などだけの変更）
if git diff --quiet "$CACHED_COMMIT_REF" "$COMMIT_REF" -- data content scripts src config package.json netlify.toml; then
  echo "サイトに影響する変更がないためビルドしません"
  exit 0
fi
exit 1
