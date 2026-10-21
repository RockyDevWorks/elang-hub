#!/usr/bin/env bash
# Replicate GitHub issue administration from elang-rs into elang-hub.
# Requirements: GitHub CLI (gh), jq; authenticated admin account.
set -euo pipefail
ORG=RockyDevWorks
SOURCE="$ORG/elang-rs"
TARGET="$ORG/elang-hub"
command -v gh >/dev/null || { echo "Install GitHub CLI: https://cli.github.com/"; exit 1; }
command -v jq >/dev/null || { echo "Install jq first."; exit 1; }
gh auth status >/dev/null
echo "Copying labels from $SOURCE to $TARGET..."
gh api --paginate "repos/$SOURCE/labels?per_page=100" --jq '.[] | @json' | while IFS= read -r entry; do
  name=$(jq -r .name <<<"$entry")
  payload=$(jq -c '{name,color,description}' <<<"$entry")
  if gh api "repos/$TARGET/labels/$(jq -rn --arg x "$name" '$x|@uri')" >/dev/null 2>&1; then
    gh api -X PATCH "repos/$TARGET/labels/$(jq -rn --arg x "$name" '$x|@uri')" --input - <<<"$payload" >/dev/null
  else
    gh api -X POST "repos/$TARGET/labels" --input - <<<"$payload" >/dev/null
  fi
  echo "  label: $name"
done
echo "Copying milestone names and descriptions (not completion status or dates)..."
gh api --paginate "repos/$SOURCE/milestones?state=all&per_page=100" --jq '.[] | @json' | while IFS= read -r entry; do
  title=$(jq -r .title <<<"$entry")
  existing=$(gh api --paginate "repos/$TARGET/milestones?state=all&per_page=100" --jq '.[] | @json' | jq -r --arg t "$title" 'select(.title==$t) | .number' | head -1)
  payload=$(jq -c '{title,description}' <<<"$entry")
  if [[ -n "$existing" ]]; then
    gh api -X PATCH "repos/$TARGET/milestones/$existing" --input - <<<"$payload" >/dev/null
  else
    gh api -X POST "repos/$TARGET/milestones" --input - <<<"$payload" >/dev/null
  fi
  echo "  milestone: $title"
done
echo "Adding Hub release milestones..."
for ver in 0.1.0 0.2.0 0.3.0 0.4.0 0.5.0 0.6.0 0.7.0 0.8.0 0.9.0 1.0.0; do
  title="v$ver — ELANG Hub"
  found=$(gh api --paginate "repos/$TARGET/milestones?state=all&per_page=100" --jq '.[].title' | grep -Fx "$title" || true)
  if [[ -z "$found" ]]; then
    gh api -X POST "repos/$TARGET/milestones" -f title="$title" -f description="ELANG Hub v$ver release" >/dev/null
  fi
done
echo "Copying safe merge settings (without touching visibility or branch rules)..."
source_settings=$(gh api "repos/$SOURCE")
jq -n --argjson s "$source_settings" '{allow_auto_merge:$s.allow_auto_merge,allow_update_branch:$s.allow_update_branch,allow_squash_merge:$s.allow_squash_merge,allow_merge_commit:$s.allow_merge_commit,allow_rebase_merge:$s.allow_rebase_merge}' | gh api -X PATCH "repos/$TARGET" --input - >/dev/null
echo "Done: labels, milestone scaffolding, and merge preferences."
echo "LINGUA FRANCA project linkage and branch protection need separate review; no issues were created."
