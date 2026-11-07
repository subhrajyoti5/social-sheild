# SocialShield — Instagram Social Circle Privacy Manager

A Chrome Extension built with Manifest V3 and the native Chrome Side Panel API. SocialShield enables users to discover connected accounts up to three degrees of separation from a target account and manage their Instagram privacy locally and safely.

---

## Key Features

- **Chrome Side Panel Experience**: Opens directly in Chrome's right-side panel via `chrome.sidePanel`, allowing simultaneous interaction with Instagram in the main tab without context switching.
- **Independent Social Graph Engine**: Fast in-memory adjacency-list graph store backed by IndexedDB for local persistence. Computes Breadth-First Search (BFS) traversals up to 3 degrees of separation with cycle detection and relationship evidence tracking.
- **Legitimate Data Sources**: Imports user-provided CSV and JSON files, relationship lists, and official Instagram data downloads (`followers_and_following`). Never fabricates connections and explicitly flags missing data.
- **Privacy Management**: Multi-select candidate staging, user-confirmed blocking and restricting guided through Instagram's native profile UI, local exclusions, and an action audit log.
- **Local-First & Safe**: Zero external backends, zero cloud storage, zero tracking, zero automated credential access, and zero hidden-API scraping.

---

## Project Structure

```text
socialshield/
├── manifest.json                  # Manifest V3 configuration with Side Panel
├── package.json                   # Package configuration and test script
├── sample-relationships.csv       # Ready-to-import sample CSV dataset
├── sample-relationships.json      # Ready-to-import sample JSON dataset
│
├── background/
│   └── service-worker.js          # Service worker for side-panel and tab messaging
│
├── sidepanel/
│   ├── sidepanel.html             # Clean, minimal light-themed side-panel layout
│   ├── sidepanel.css              # Compact typography, subtle borders, responsive
│   └── sidepanel.js               # Application controller & state management
│
├── content/
│   └── instagram.js               # Minimal content script detecting current profile URL
│
├── graph/
│   ├── bfs.js                     # BFS traversal with cycle detection & max 3 degrees
│   ├── graph-store.js             # Adjacency-list graph store & IDB synchronisation
│   ├── relationship-parser.js     # Record parser supporting multiple schemas
│   └── deduplicate.js             # Username normalisation & edge deduplication
│
├── importer/
│   ├── csv-importer.js            # CSV parser with auto-column detection
│   └── json-importer.js           # Multi-format JSON importer
│
├── privacy/
│   ├── candidate-manager.js       # Block, restrict, and exclude staging
│   ├── action-review.js           # Guided confirmation workflows
│   └── history.js                 # Local audit log of privacy actions
│
├── storage/
│   └── database.js                # IndexedDB persistence layer
│
├── assets/
│   └── icons/                     # Extension icons (16px, 48px, 128px)
│
└── tests/
    ├── run-all-tests.js           # Master test runner
    ├── deduplicate.test.js        # Normalisation & deduplication tests
    ├── bfs.test.js                # BFS, cycle detection & 10k-node benchmark
    ├── importer.test.js           # CSV & JSON import parsing tests
    └── privacy.test.js            # Candidate manager, review & history tests
```

---

## Installation Instructions

1. Open Google Chrome.
2. Navigate to `chrome://extensions/`.
3. Enable **Developer mode** via the toggle switch in the top-right corner.
4. Click **Load unpacked**.
5. Select the `socialshield` folder:
   `c:\Users\subhr\OneDrive\Desktop\social-sheild\socialshield`
6. The SocialShield icon will appear in your Chrome toolbar.

---

## How to Use

1. **Open Instagram**: Navigate to [https://www.instagram.com](https://www.instagram.com) in Chrome.
2. **Open the Side Panel**: Click the SocialShield shield icon in the Chrome toolbar. The side panel will open on the right side of the window, leaving Instagram visible on the left.
3. **Import Relationship Data**:
   - Click **Import CSV / JSON** or drag and drop a file onto the import area.
   - You can test immediately using `sample-relationships.csv` or `sample-relationships.json`.
4. **Analyse a Target Account**:
   - Enter an Instagram username (e.g., `alex_runner`) or paste a profile URL.
   - Choose your graph depth (1°, 2°, or 3°).
   - Click **Analyse**.
5. **Review Discovered Accounts**:
   - Browse the structured list with degrees, relationship evidence, and status badges.
   - Filter by degree (1°, 2°, 3°) or status (Block, Restrict, Excluded).
   - Search accounts by username.
6. **Take Action**:
   - Select accounts via checkboxes or use **Select all**.
   - Click **Names** or **URLs** to copy to clipboard.
   - Click **CSV** to export the filtered or selected list.
   - Click **Block** or **Restrict** to trigger the guided review modal.
   - Follow the step-by-step instructions on Instagram's native interface, then click **Confirm Completed** to record the action in your local history.

---

## Important Data Limitations & Platform Safety

- **No Hidden Scraping**: SocialShield does not pretend that Instagram provides unrestricted access to arbitrary users' followers. A username alone cannot reveal a private 3-degree graph.
- **Legitimate Data Only**: The extension strictly processes data you import (CSV, JSON, or official Instagram data downloads) and displays the exact provenance for every relationship. Missing connections are explicitly reported.
- **Native Instagram Protection**: SocialShield never bypasses Instagram security checks, never harvests credentials or session cookies, and never performs unattended bulk actions. Every privacy action is confirmed by the user through Instagram's native interface.

---

## Running the Test Suite

The test suite requires Node.js (v16+) and uses vanilla JavaScript ES Modules:

```bash
cd socialshield
node tests/run-all-tests.js
```

All 26 unit and integration tests across 15 categories will execute and verify:
- BFS traversal up to 3 degrees
- Cycle detection & duplicate elimination
- Relationship directionality & evidence tracing
- CSV & JSON import parsing with schema auto-detection
- Candidate staging, user confirmation, and action history
- 10,000-node graph traversal benchmark (<500ms)

