# Repository recovery notes

## Active repository

Use this clean clone for new work:

`/Users/junedelmar/Developer/Freq-clean`

Its `master` branch tracks the GitHub `master` branch, created from the verified `origin/main` commit `c2398c9` on 2026-09-05.

## Preserved original work

The original workspace remains intact at:

`/Users/junedelmar/Documents/PlatformIO/Projects/Freq`

It is currently checked out on `feat/web-landing-page` at `e535ad6`. Its unpublished local commits and source files have **not** been reset, deleted, or overwritten.

The original repository also has a local `master` branch at `9684339`, which is an ancestor of `feat/web-landing-page` by 70 commits.

## Migration status

The original repository currently cannot package local objects for transfer: Git stalls in `pack-objects` and reports `mmap failed: Operation canceled`. GitHub connectivity and authentication work; only the local object-pack operation is blocked.

Do not delete the original workspace. Migrate the feature work into this clean clone after resolving that local Git/filesystem issue, or by deliberately copying the source snapshot into a new branch when preserving the unpublished commit history is not required.
