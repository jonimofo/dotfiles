# MKV cleanup rules (TV shows)

Instructions for Claude Code (or anyone) cleaning MKV episodes with `mkvclean.py`.
To make Claude Code apply them automatically, copy this file as `CLAUDE.md` into
the TV shows folder (e.g. `03-TV-SHOWS/CLAUDE.md`), or tell it: "follow MKV_CLEANUP_RULES.md".

## What to keep in every episode

| Order | Track | Rule | Default |
|---|---|---|---|
| 1 | Video | the only video track | yes |
| 2 | Audio | **English original (VO) only**: French and every other audio track are removed | yes |
| 3 | Subtitle | **English SRT**: the plain one, else the SDH one | yes, shown on start |
| 4 | Subtitle | **French SRT**: the full VF one, else the only VF one available (even forced-only). **Never VFQ** | no |

Everything else is removed: other audio tracks, forced subtitles when a full one exists,
duplicates, VFQ, attachments. No re-encoding, ever: remux only (`mkvmerge`).

The track *name* wins over the flags: some releases set the "forced" flag on full subtitles
("Complets") by mistake. "Forcés" / "Forced" in the name = forced.

## Workflow

1. **One show at a time, one season at a time.**
2. Before each season: run `python mkvclean.py plan "<season folder>"` and show the user a
   short plan (which tracks are kept / removed, grouped by episodes, special cases, expected
   space saved). **Wait for the user's go before every season.**
3. Run `python mkvclean.py replace "<season folder>"`. For each episode it:
   - remuxes to `<name>.tmp-clean.mkv` next to the original,
   - verifies track count, order, language, codec, default/forced flags, duration,
     and the SHA-256 of the raw packets of every kept track against the original,
   - replaces the original only if everything matches (modification date preserved);
     on any failure the original is left untouched and the temp file deleted.
4. After each season, report to the user: episodes processed, failures, GB saved, and
   anything unusual. Then show the plan for the next season.

Edge cases already decided by the user:
- Episode without French SRT → process it anyway (English only), it goes in the report.
- Only forced French SRT available → keep it, it goes in the report.
- Episode without English audio → do not touch it, it goes in the report.
- Episodes not in a "Season N" folder → process them in place, don't create folders.
- A file open in a player (Windows) cannot be replaced → reported as an error, original kept.

## Report

- Only errors and warnings; **no issue = no report file**.
- One report per show, at the root of the show folder (where the season folders are),
  appended season after season.
- File name: `YYYYMMDD-Cleanup_Report_<Show_Name>_MKV.txt` (date of creation, words joined
  with underscores, show name included), content in English.
- `mkvclean.py` does all of this by default (`--report FILE` to override, `--no-report` to disable).
  If a check fails for a reason that turns out to be harmless, re-run that episode and
  rewrite its report line to explain what happened.

## Setup

- Linux (Debian/Ubuntu): `sudo apt install mkvtoolnix ffmpeg python3`
- Windows: `winget install Python.Python.3.12 MoritzBunkus.MKVToolNix Gyan.FFmpeg`
  (open a new terminal afterwards; the script also finds mkvmerge in `C:\Program Files\MKVToolNix`)
- Windows paths: quote them, e.g. `python mkvclean.py plan "D:\TV\Scrubs 2026\Season 1"`.
  Wildcards like `"Season 1\*.mkv"` work too, the script expands them itself.
- Disk space: the temp file needs about one episode of free space; there is never a full copy.
