---
description: TTADK Standard Commit Command

---

## Execution Rules (STRICT)

- Execute commands **strictly in order**
- **DO NOT run any extra commands** beyond this flow
- **DO NOT run pre-checks or exploratory commands**, including:
  - `git status`
  - `git diff --stat`
  - `git remote get-url`
- Do not inspect environment or validate assumptions
- Trust the defined steps and proceed directly

***

## Single Repository

### Steps

1. **Stage && Collect context**
   ```bash
      git add -A
      FILES=$(git diff --cached --name-only)
      DIFF=$(git diff --cached)

      if [ -z "$FILES" ]; then
         echo "No changes to commit" && exit 0
      fi
   ```
2. **Generate commit message**

   Model uses full $DIFF to generate conventional commit message

   Format:
   ```
   <type>(<scope>): <subject>
   ```
   Types: feat, fix, docs, style, refactor, test, chore

   Rules:
   - ≤72 chars
   - imperative mood
   - reflect actual intent (not file ops)
   - **no emoji**
3. **Commit & push**
   ```bash
      git commit -m "$MESSAGE"
      git push -u origin $(git branch --show-current)
   ```

***

## Multi-Repo / Submodules

- Commit each repo separately
- Do NOT commit nested repo changes from parent
- Commit submodules first, then main repo

***

## Constraints

- DO NOT modify code
- On commit/push failure → **stop and report**
- Do NOT resolve conflicts automatically
- No remote → commit only
- No changes → skip

***

## Output

```
## [OK] Commit Summary

1. repo-a - [OK] feat: xxx -> Pushed | MR: <merge request URL>
2. repo-b - [SKIP] No changes
3. repo-c - [FAIL] Push failed. Reason: xxxx
```
