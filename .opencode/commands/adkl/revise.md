---
description: update existing feature documents (spec.md, plan.md, tasks.md) for the current feature without creating a new feature directory.

---

## User Input

```text
$ARGUMENTS
```
You **MUST** consider the user input before proceeding (if not empty).

If the given `$ARGUMENTS` contains a link, you need to read the content of the link (use lark-docs mcp if it's a lark doc) and replace the link with content.

## Phase

- ### **Phase 1: Context & Environment Setup**

  **Objective:** Gather all necessary context and configure the environment.

  1.  **Set Language:**
      - Read `.ttadk/config.json` to determine `preferred_language`.
      - Default to 'en' if the file or key is missing.
      - **Crucially, all subsequent outputs MUST be in this language.**
  2.  **Load Core Instructions:**
      - Read `.ttadk/memory/constitution.md`.
      - These are your guiding principles. Adhere to them strictly.
  3.  **Analyze User Request (`$ARGUMENTS`):**
      - If `$ARGUMENTS` contains a URL (e.g., a Lark document), fetch its full content and use that as the primary input.
      - Carefully parse the final text to understand the update requirements.
  ---

  ### **Phase 2: Analysis & Validation**

  **Objective:** Validate we have a valid feature directory and understand current state.

  1.  **Get Feature Directory & Locate Documents:**
      - Run `node .ttadk/plugins/ttadk/core/resources/scripts/check-prerequisites.js --json --include-tasks` to get FEATURE_DIR from the current feature.

  2.  **Locate Existing Documents:**
      - **Explicitly check which documents exist** using Read tool for each file:
        * `FEATURE_DIR/spec.md` (REQUIRED)
        * `FEATURE_DIR/plan.md` (REQUIRED)
        * `FEATURE_DIR/tasks.md` (REQUIRED)
        * `FEATURE_DIR/technical-design.md` (optional, from `/adk:erd`)
      - **Build and maintain a DISCOVERED_DOCS tracking list:**
        ```
        DISCOVERED_DOCS = {
          "spec.md": { exists: true, path: "...", required: true },
          "plan.md": { exists: true, path: "...", required: true },
          "tasks.md": { exists: true, path: "...", required: true },
          "technical-design.md": { exists: true/false, path: "...", required: false },
        }
        ```
      - If any required file (spec.md, plan.md, tasks.md) doesn't exist, **STOP** and inform the user:
        - "Cannot find feature documents in specs/{feature-name}/"
        - "Please use /adkl:proposal first to create the initial documents"
      - This list is **REQUIRED** for Phase 3 and Phase 4 - every existing document must be processed.

  3.  **Read Current State:**
      - Read all existing documents to understand:
        - Current feature requirements (spec.md)
        - Current technical approach (plan.md)
        - Current task breakdown (tasks.md)
        - Current technical design (technical-design.md, if exists)
      - Use tools like `rg` and `ls` to explore related code changes that may have been implemented.

  4.  **Clarification (Interactive Step):**
      - **If the update request is ambiguous, incomplete, or conflicts with existing documents or code:**
          - Formulate specific, targeted questions for the user.
          - **Do not proceed until you receive clarification.** This prevents rework and ensures alignment.

  ---

  ### **Phase 3: Document Update**

  ⚠️ **THIS PHASE IS MANDATORY - DO NOT SKIP ANY STEP FOR EXISTING DOCUMENTS**

  **Objective:** Update core design documents, then synchronize technical documentation.

  - **BEFORE proceeding to Phase 4, you MUST process ALL documents in DISCOVERED_DOCS**
  - For each document where `exists: true`:
    * **Analyze impact**: Determine if user's changes affect this document
    * **If affected**: Update the document with relevant changes
    * **If not affected**: Record "No changes needed" with specific reason (for Phase 4 report)

  1.  **Update Feature Specification (`spec.md`):**
      - Read existing `spec.md` to understand current requirements.
      - Integrate the new requirements from `$ARGUMENTS` with existing content.
      - Update sections as needed while maintaining the original template structure.
      - Ensure the updated spec clearly reflects both existing and new requirements.
      - **Important:** Preserve any sections that are still relevant; only update what needs to change.

  2.  **Update Implementation Plan (`plan.md`):**
      - Read existing `plan.md` to understand current technical approach.
      - Adjust the technical solution to accommodate changes from the updated `spec.md`.
      - Update affected sections: architecture changes, file modifications, API changes, etc.
      - Ensure consistency with the updated specification.
      - **Important:** Consider backward compatibility and migration paths if applicable.

  3.  **Update Task Breakdown (`tasks.md`):**
      - Read existing `tasks.md` to understand current task breakdown.
      - Update tasks to reflect changes from the updated `plan.md`.
      - Mark any obsolete tasks appropriately (e.g., strikethrough or remove if not started).
      - Add new tasks for new requirements.
      - Reorder tasks if the implementation sequence has changed.
      - **Important:** Maintain traceability to User Stories defined in the plan.

  4.  **Save all core document updates:**
      - Write updated `spec.md`, `plan.md`, and `tasks.md` to disk.
      - **This ensures ERD update in next step can reference the latest changes.**

  5.  **Update Technical Design Document (`technical-design.md`) - If Exists:**

      ⚠️ **THIS STEP IS MANDATORY IF technical-design.md EXISTS**

      - **ALWAYS perform impact analysis** - do not skip this step if file exists
      - Read existing `technical-design.md` to understand current technical design (architecture, data model, interfaces, schemas).
      - **Update triggers** (if ANY of these apply, technical-design.md MUST be updated):
        * New entities or data fields in spec.md → Update ER diagrams
        * Changed relationships or data model in plan.md → Update entity relationships
        * New API endpoints or interface changes → Update interface definitions
        * Database schema changes → Update schema definitions
        * Architecture changes → Update architecture diagrams
      - Update the technical design to reflect:
        - Architecture diagram changes
        - New entities or fields mentioned in updated requirements
        - Modified relationships due to architectural changes
        - Updated interface definitions (API/RPC)
        - Updated schema definitions (DB/MQ/Cache)
      - Regenerate Mermaid diagrams with updates.
      - Ensure all Mermaid diagrams follow correct syntax.
      - **If no updates needed**: Document specific reason why changes do NOT affect technical design
        (e.g., "Changes only affect UI text, no technical design impact")
      - Save updated `technical-design.md`.
      - **If technical-design.md does not exist:** Skip this step (user can generate it later with `/adk:erd`).

  6.  **Validation (REQUIRED before Phase 4):**

      **Cross-document consistency checks:**
      - For each document in DISCOVERED_DOCS where `exists: true`:
        * Verify it was either **updated** OR **explicitly marked as "no changes needed" with reason**
      - **Verify cascading consistency:**
        * spec.md changes → plan.md must reflect technical approach changes
        * plan.md changes → tasks.md must reflect task breakdown changes
        * plan.md data model changes → technical-design.md must reflect ER diagram changes
      - **FAIL validation if:**
        * Any existing document was neither updated nor explicitly reviewed
        * Changes cascade but downstream documents were not updated

  ---

  ### **Phase 4: Summary and Next Steps**

  **Objective:** Provide clear summary of changes and guidance for next steps.

  1.  **Summarize Changes:**

      **Document Update Summary (REQUIRED for each document in DISCOVERED_DOCS):**

      | Document | Exists | Updated | Sections Changed | Reason if Not Updated |
      |----------|--------|---------|------------------|----------------------|
      | spec.md  | ✓      | ✓/✗     | (list sections)  | (reason or "-")      |
      | plan.md  | ✓      | ✓/✗     | (list sections)  | (reason or "-")      |
      | tasks.md | ✓      | ✓/✗     | (list tasks)     | (reason or "-")      |
      | technical-design.md | ✓/✗ | ✓/✗ | (list sections) | (reason or "-")    |

      - **If any document exists but was NOT updated, you MUST provide explicit reasoning**
      - Highlight any breaking changes or significant architectural shifts.

  2.  **Recommend Next Steps:**
      - Suggest immediate actions the developer should take (e.g., review specific sections, update code, run tests).
      - Note any potential impacts on existing implementation.

  ---

  ### **Guiding Principles (Guardrails)**

  - **Preservation First:** Only update what needs to change. Preserve existing content that remains valid.
  - **Consistency:** Ensure all three documents remain aligned with each other after updates.
  - **Traceability:** Maintain clear connections between spec requirements, plan implementation, and task breakdown.
  - **Clarity:** Make it obvious what changed and why.
  - **Respect Templates:** Preserve the section order and headings of all template files.
  - **URL Content Fetch**: Use lark-docs mcp to get a lark document content.
  - **No New Feature:** This command updates existing documents only; it does NOT create a new feature directory.

  **CRITICAL - Cross-document update rules:**
  - **If any design document exists, you MUST either:**
    1. Update it based on user's changes, OR
    2. Explicitly state in the Document Update Summary why no updates were needed
  - **Never report completion without having processed ALL existing design documents**
  - **Document skips are NOT allowed** - every document in DISCOVERED_DOCS where `exists: true` must be analyzed
  - **Cascading updates are MANDATORY**: spec changes → plan changes → tasks changes → technical-design changes

## Next Step Guidance

After executing this command, provide next-step guidance to user:

### Step 1 - Confirmation
Guide user to verify the updated documents (spec.md, plan.md, tasks.md, etc.) are correct.

**If needs adjustment**: Run `/adkl:revise [feedback]` again to continue refining the documents.

### Step 2 - Next Step Recommendation
Once documents are confirmed and satisfactory:

**Start Implementation**: Execute `/adkl:apply` to begin implementing the tasks sequentially.
