# Virtual Venue Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic hardware-free simulator for queue MQTT state and LED display payloads.

**Architecture:** An in-process retained-message bus feeds isolated virtual kiosk and display consumers. Scenario fixtures model the states used by the web API, physical kiosk, and display firmware; assertions check rejection, retention, identity, and capacity behavior.

**Tech Stack:** Node.js ESM, `node:test`, `node:assert`, HTML preview.

---

### Task 1: Define failing scenario contracts

**Files:**
- Create: `tests/virtual-venue/virtual-venue.test.mjs`

- [ ] Add tests for idle/active/queue/offered/scheduled message delivery, malformed-message retention, and queue-capacity limits.
- [ ] Run `node --test tests/virtual-venue/virtual-venue.test.mjs` and confirm it fails because the harness module is missing.

### Task 2: Implement the virtual venue

**Files:**
- Create: `tests/virtual-venue/virtual-venue.mjs`
- Modify: `web/package.json`

- [ ] Implement the retained bus, kiosk consumer, display consumer, fixtures, scenario runner, and optional HTML renderer.
- [ ] Add `test:virtual-venue` to run the harness tests.
- [ ] Run the focused tests and the command with HTML output.

### Task 3: Verify adjacent consumers

**Files:**
- No production files.

- [ ] Run the full web test suite, all shell contract tests, kiosk simulator build, and display firmware build.
- [ ] Commit the design, plan, harness, and package script.
