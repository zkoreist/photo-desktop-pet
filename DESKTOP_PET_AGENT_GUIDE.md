# Photo Desktop Pet — AI Agent Build & Release Guide

> Purpose: a practical, repeatable runbook for an AI coding agent to build, test, document, publish, and maintain an open-source Windows desktop-pet application from zero. Execute the phases in order. Do not claim features, metrics, or maintenance activity that has not happened.

## 1. Product definition

### 1.1 Working name

**Photo Desktop Pet** (change after a GitHub-name availability check). Tagline: “Turn a photo you have permission to use into a private, local Windows desktop companion.”

### 1.2 MVP user story

A Windows user selects a JPG, PNG, or WebP photo. The app creates (or accepts) a transparent cut-out image, then shows it in a borderless transparent always-on-top desktop window. The pet idles, walks, bounces safely inside the selected display, can be dragged, and can be paused or closed from a system-tray menu.

### 1.3 Non-goals for version 0.1

- No cloud upload, face recognition, identity inference, deepfake generation, or social features.
- No claim that one photo generates true skeletal animation; 0.1 uses safe, simple transforms such as bobbing, mirroring, squash/stretch, and movement.
- No macOS/Linux support commitment until Windows is stable.
- No background removal model shipped before license, download size, offline behavior, and provenance are documented.

### 1.4 Safety, privacy, and rights requirements

- Process images locally by default. Never upload photos without an explicit opt-in and a privacy notice.
- Require users to confirm that they own the image or have permission to use it.
- Never include real user photos, secrets, API keys, or telemetry identifiers in the repository, issues, test fixtures, screenshots, or releases.
- Use a generic illustrated sample image or a public-domain/licensed asset in documentation.
- Do not market the tool for impersonation, harassment, surveillance, or non-consensual use.

## 2. Technical decision record

Use this baseline unless a validated constraint requires another choice.

| Area | Choice | Reason |
| --- | --- | --- |
| Desktop shell | Tauri 2 | Small Windows binaries and direct native window control |
| UI | React + TypeScript + Vite | Fast iteration and typed UI/state |
| Native layer | Rust | Tauri commands, filesystem boundaries, window/tray integration |
| State | Zustand or React context | Small local application state |
| Tests | Vitest + Playwright | Unit tests and end-to-end UI coverage |
| Formatting | Biome or ESLint + Prettier | Repeatable lint/format checks |
| CI | GitHub Actions | Windows build/test/release automation |
| License | MIT | Low-friction permissive open-source baseline |

### 2.1 Architecture

```text
React UI
  ├─ import/crop/settings screens
  ├─ pet renderer + input handling
  └─ typed invoke bridge
        │
Tauri / Rust
  ├─ validated file import and app-data storage
  ├─ transparent pet window, display bounds, tray menu
  ├─ startup and settings persistence
  └─ optional local image-processing adapter
        │
Local app-data directory
  ├─ pet images (not source-controlled)
  └─ JSON preferences and versioned migrations
```

Keep UI animation deterministic and independently testable. Abstract platform-specific window operations behind a small interface so the pet-engine package can run under unit tests without Tauri.

## 3. Repository bootstrap

### 3.1 Prerequisite checks

Before scaffolding, the agent must verify and report versions for Git, Node.js LTS, npm/pnpm, Rust stable, Cargo, and Visual Studio Build Tools with the C++ workload. Install missing dependencies only after user approval. Use the official Tauri prerequisites documentation for current Windows setup.

### 3.2 Initialize locally

1. Create a new empty directory named `photo-desktop-pet`.
2. Initialize Git and configure only repository-local Git settings when needed.
3. Scaffold the official Tauri + React + TypeScript template.
4. Install dependencies using a lockfile-preserving package manager command.
5. Start the development app and verify it opens on Windows before custom work begins.
6. Commit the untouched scaffold as `chore: initialize Tauri React application`.

### 3.3 Target layout

```text
photo-desktop-pet/
├─ src/                         # React UI
│  ├─ components/
│  ├─ features/import/
│  ├─ features/pet/
│  ├─ features/settings/
│  └─ lib/
├─ src-tauri/                   # Rust + Tauri configuration
│  └─ src/
├─ packages/
│  ├─ pet-engine/               # Pure TypeScript state machine/math
│  └─ image-pipeline/           # Image interfaces and local adapters
├─ docs/
│  ├─ architecture.md
│  ├─ privacy.md
│  ├─ development.md
│  └─ roadmap.md
├─ .github/
│  ├─ ISSUE_TEMPLATE/
│  ├─ workflows/
│  └─ pull_request_template.md
├─ assets/sample/                # Licensed, non-personal demo asset only
├─ README.md
├─ CONTRIBUTING.md
├─ CODE_OF_CONDUCT.md
├─ SECURITY.md
├─ LICENSE
└─ .gitignore
```

## 4. Delivery plan and acceptance criteria

### Phase A — Transparent window proof of concept

Implement a separate, transparent, borderless, always-on-top pet window. Render a bundled transparent sample PNG. Add a development-only toggle to return to the main window.

Acceptance:

- The window has no opaque rectangle around the PNG.
- It stays above normal windows but does not prevent Alt+Tab or taskbar use.
- Closing the pet does not corrupt settings or leave an orphan process.
- Test manually on Windows 10 and Windows 11 if available.

### Phase B — Pet engine

Implement a pure `pet-engine` package with state (`idle`, `walking`, `dragging`, `paused`), coordinates, velocity, elapsed time, and display bounds. Use a seeded random generator in tests.

Rules:

- Update at a capped timestep; clamp large elapsed-time jumps.
- Keep the image fully within its work area, including scaling.
- Bounce or choose a new direction at boundaries.
- Disable autonomous motion while dragging.
- Persist the final drag position only after drag ends.

Acceptance:

- Unit tests cover movement, boundary collision, drag transitions, pause, and restored positions.
- Pet survives monitor resolution changes by clamping its coordinates.

### Phase C — Photo import and local storage

Implement a file picker limited to JPG, JPEG, PNG, and WebP. Validate extension, MIME type where available, readable content, and a documented maximum source size. Copy imported data into the app-data directory under a generated ID; do not reference arbitrary external paths after import.

The first release must support two routes:

1. **Recommended reliable route:** user supplies an already transparent PNG.
2. **Convenience route:** local background removal only when a vetted dependency/model is ready; otherwise show a clear “coming soon” state, never a fake success.

Acceptance:

- Bad, huge, missing, and unsupported files produce useful non-sensitive errors.
- Imported data survives restart and can be deleted through the UI.
- App data never enters Git.

### Phase D — Crop, anchor, and scale editor

Provide a preview with crop/scale controls and a “feet anchor” adjustment. The anchor is the position that tracks ground contact during movement. Save edits non-destructively where possible.

Acceptance:

- A user can correct an imperfect cut-out without editing external files.
- Preview and pet window use the same scale and anchor calculations.

### Phase E — Interaction and tray

Add click response (bubble or brief bounce), right-click menu, and a system-tray menu with Show/Hide, Pause/Resume, Settings, and Quit. Respect Windows accessibility: keyboard path to all main settings, visible labels, no rapid flashing, and reduced-motion preference.

Acceptance:

- Tray Quit exits cleanly.
- Paused state uses no continuous animation loop.
- Click-through is opt-in, obvious, and recoverable through the tray menu.

### Phase F — Distribution

Configure signed installers only when the user owns a valid code-signing certificate. Until then, describe Windows SmartScreen behavior honestly; do not bypass security warnings. Produce a reproducible unsigned test build and publish checksums.

Acceptance:

- CI builds the Windows installer from a clean checkout.
- A fresh test user can install, launch, import the sample, and remove the app.

## 5. Image background-removal policy

Do not blindly bundle a model found online. Before adding an automatic removal dependency, record:

- exact package/model source and version;
- license compatibility with MIT distribution;
- model size and download behavior;
- offline vs network behavior;
- CPU/GPU requirements and expected latency;
- attribution and notices required in `THIRD_PARTY_NOTICES.md`.

Offer cancellation, progress, and a fallback to transparent PNG import. Run image decoding and model work off the UI thread. Never log image bytes, paths containing personal data, or face-related metadata.

## 6. Quality gates

The agent must make commands discoverable in `package.json` and run these before every PR or release:

```text
install → lint → format-check → typecheck → unit-test → build → e2e-test (where supported)
```

Required tests:

- pet-engine behavior and geometry;
- settings schema migration;
- input validation and storage path isolation;
- UI smoke: import sample, create pet, pause/resume, delete pet;
- manual transparent-window checklist documented in `docs/development.md`.

Treat warnings as work items. Do not weaken tests, lower coverage thresholds, or skip checks merely to obtain a green pipeline.

## 7. Documentation and open-source governance

Create before the first public release:

- `README.md`: purpose, GIF/screenshot using a non-personal asset, quick start, privacy promise, feature status, limitations, and uninstall instructions.
- `CONTRIBUTING.md`: local setup, branches, test commands, conventional commit recommendation, PR expectations.
- `SECURITY.md`: supported versions, private vulnerability-reporting contact/process, no public disclosure of exploitable details.
- `CODE_OF_CONDUCT.md`: contributor conduct and contact.
- `docs/privacy.md`: local processing, storage location, telemetry status, third parties, deletion steps.
- `docs/roadmap.md`: explicit planned vs shipped items.
- GitHub issue templates: bug, feature request, security notice directing reporters to `SECURITY.md`.

Use factual language: say “local-only in v0.1” only after verifying all relevant code paths. Never invent user counts, download figures, security claims, performance benchmarks, endorsements, or contributor activity.

## 8. Git workflow

1. Work in focused branches: `feat/...`, `fix/...`, `docs/...`, `chore/...`.
2. Make small, meaningful commits with tests in the same change where practical.
3. Inspect `git status` and `git diff --check` before each commit.
4. Never commit `.env`, keys, certificates, installer credentials, personal photos, build output, or application data.
5. Before pushing, inspect the staged diff and run quality gates.
6. Use pull requests even for solo work when practical; write a concise summary, test evidence, and risk notes.

Recommended `.gitignore` entries include dependency directories, build artifacts, Tauri target directories, `.env*` (except a documented `.env.example`), generated installers, local app-data fixtures, and photo imports.

## 9. GitHub publication protocol

Publishing changes to a user’s GitHub account is an external action. The agent must ask for confirmation immediately before each of these actions: creating a remote repository, pushing a branch, opening a PR, creating a release, changing repository visibility, or enabling GitHub Actions secrets.

Before the confirmation request, report:

- proposed owner/repository name and public/private visibility;
- exact branch and commit range to publish;
- licenses and any third-party model/dependency notices;
- CI status and any unrun checks;
- whether screenshots/assets contain identifiable people;
- requested GitHub permissions or secrets (normally none for an initial public repo).

Suggested first release process:

1. Create an empty **public** GitHub repository only after confirmation.
2. Push `main` with core files and passing CI.
3. Add repository description, topics (`windows`, `tauri`, `react`, `desktop-pet`, `privacy`), license detection, and issue templates.
4. Create a `v0.1.0` annotated tag after confirmation.
5. Let CI build release artifacts. Inspect artifact names and checksums.
6. Draft a release with factual notes, supported platform, known limitations, and installation/uninstall instructions. Publish only after a final user confirmation.

Do not put credentials in source code, release assets, Git history, CI logs, or issue comments. If a secret is exposed, revoke/rotate it immediately and follow the hosting provider’s remediation guidance; removing it from a later commit is not sufficient.

## 10. AI agent operating rules

- Read repository instructions (`AGENTS.md`, `CONTRIBUTING.md`) before acting.
- Make a short plan; update it as phases finish.
- Prefer official documentation for Tauri, GitHub Actions, package dependencies, and Windows APIs.
- Inspect existing code before editing and preserve unrelated user changes.
- Use generated test/demo assets only when their license and provenance are documented.
- Ask rather than assume when a decision changes scope, costs money, creates an account/repository, uses a paid API, transmits images, or publishes externally.
- Run tests proportional to change risk and report commands/results accurately.
- Stop and explain blockers; never fabricate completion.

## 11. Release definition of done (v0.1.0)

- [ ] A clean Windows installation can launch a transparent pet from a transparent PNG.
- [ ] Import, delete, scaling, dragging, idle/walk, pause, tray controls, and quit work.
- [ ] No network requests occur during normal photo import/runtime unless explicitly enabled and documented.
- [ ] Privacy, rights, security, contribution, and license documents exist and match the implementation.
- [ ] Lint, formatting, types, unit tests, build, and relevant E2E tests pass in CI.
- [ ] Release notes state known constraints (e.g., automatic background removal availability).
- [ ] Repository contains no private photos, credentials, or unlicensed assets.
- [ ] GitHub repository and release publication were explicitly approved by the account owner.

## 12. Suggested initial issues

1. Bootstrap Tauri + React project and CI.
2. Create transparent always-on-top pet window.
3. Implement tested pet-engine movement state machine.
4. Add import and safe app-data storage.
5. Add image preview, scale, and anchor editor.
6. Add system tray and accessibility settings.
7. Write privacy/security/contribution docs.
8. Evaluate local background-removal options and licenses.
9. Package test installer and manual QA checklist.

## 13. First agent prompt

Use the following as a starting instruction for an implementation agent:

> Build Photo Desktop Pet according to `DESKTOP_PET_AGENT_GUIDE.md`. Begin with Phase A only. Inspect the repository, state a concise plan, scaffold Tauri 2 + React + TypeScript if absent, and implement a transparent always-on-top development pet window displaying only a licensed generic sample PNG. Add tests/documentation appropriate to the phase. Do not create or publish a GitHub repository, push, use private user photos, upload images, install paid services, or claim unimplemented capabilities without asking me first. Run the relevant checks and report exactly what changed and what passed.
