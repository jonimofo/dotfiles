#!/usr/bin/env python3
"""Clean up MKV episodes by remuxing (no re-encoding). Linux, macOS and Windows.

Keeps only:
  - the video track
  - the English audio (1st audio track, default)
  - one English SRT: normal, else SDH (1st subtitle, default = shown)
  - one French SRT: VF full, else the only VF one available; never VFQ (not default)
Everything else (French audio, extra subtitles, attachments) is dropped.
The rules are explained in MKV_CLEANUP_RULES.md next to this script.

Usage:
  python mkvclean.py plan    PATH...   show what would be kept / dropped (changes nothing)
  python mkvclean.py replace PATH...   remux each file to a temp file, verify it, then
                                       replace the original

PATH can be .mkv files, folders (their .mkv files, not recursive) or wildcards
("Season 1/*.mkv" works even in PowerShell / cmd).

Verification before an original is replaced: track count, order, language,
codec, default/forced flags, duration, and the SHA-256 of the raw packets of
every kept track (must be identical to the original). Any failure leaves the
original untouched.

Report: errors and warnings only, appended to
  <show folder>/YYYYMMDD-Cleanup_Report_<Show_Name>_MKV.txt
where <show folder> is the parent of a "Season N" folder (or the folder itself
when episodes are not in season folders). No issue = no report.
Override with --report FILE, disable with --no-report.

Requires mkvmerge (MKVToolNix), ffmpeg and ffprobe on PATH, Python 3.8+.
"""
import datetime, glob, json, os, re, shutil, subprocess, sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

TOOLS = {'mkvmerge': [r'C:\Program Files\MKVToolNix', r'C:\Program Files (x86)\MKVToolNix'],
         'ffmpeg': [], 'ffprobe': []}
EXE = {}


def find_tools():
    missing = []
    for tool, extra in TOOLS.items():
        path = shutil.which(tool)
        for d in extra:
            if not path and os.path.isfile(os.path.join(d, tool + '.exe')):
                path = os.path.join(d, tool + '.exe')
        if path:
            EXE[tool] = path
        else:
            missing.append(tool)
    if missing:
        sys.exit('Missing tools: ' + ', '.join(missing) + '\n'
                 'Windows: winget install MoritzBunkus.MKVToolNix Gyan.FFmpeg\n'
                 'Debian/Ubuntu: sudo apt install mkvtoolnix ffmpeg')


def run(cmd):
    return subprocess.run(cmd, capture_output=True, encoding='utf-8', errors='replace', check=True).stdout


def mkv_json(path):
    return json.loads(run([EXE['mkvmerge'], '-J', path]))


def name(t):
    return t['properties'].get('track_name', '') or ''


def lang(t):
    p = t['properties']
    ietf = (p.get('language_ietf') or '').lower()
    code = (p.get('language') or 'und').lower()
    if code in ('eng', 'en') or ietf.startswith('en'):
        return 'eng'
    if code in ('fre', 'fra', 'fr') or ietf.startswith('fr'):
        return 'fre'
    return code


def is_vfq(t):
    n = name(t).lower()
    ietf = (t['properties'].get('language_ietf') or '').lower()
    return ietf == 'fr-ca' or any(w in n for w in ('vfq', 'québ', 'queb', 'canad'))


def is_sdh(t):
    # Same as forced: the name wins, the hearing-impaired flag only counts for unnamed tracks
    n = name(t).lower()
    if n:
        return 'sdh' in n or 'malentendant' in n
    return bool(t['properties'].get('flag_hearing_impaired'))


def is_forced(t):
    # The track name wins over the flag: some releases set the forced flag on
    # the full subtitles ('Complets') by mistake.
    n = name(t).lower()
    if 'forc' in n:            # forced, forcé(s)
        return True
    if any(w in n for w in ('complet', 'full', 'sdh', 'vff', 'english', 'french', 'français')):
        return False
    return bool(t['properties'].get('forced_track'))


def describe(t):
    return f"#{t['id']} {t['type'][:3]} {lang(t)}{' (' + name(t) + ')' if name(t) else ''}"


def select(ts):
    video = [t for t in ts if t['type'] == 'video']
    eng_audio = [t for t in ts if t['type'] == 'audio' and lang(t) == 'eng']
    subs = [t for t in ts if t['type'] == 'subtitles']

    eng_subs = [t for t in subs if lang(t) == 'eng' and not is_forced(t)]
    eng_sub = ([t for t in eng_subs if not is_sdh(t)] or eng_subs or [None])[0]

    fr_subs = [t for t in subs if lang(t) == 'fre' and not is_vfq(t)]
    fr_full = [t for t in fr_subs if not is_forced(t)]
    fr_sub = (fr_full or fr_subs or [None])[0]

    infos, warnings, fatal = [], [], []
    if len(video) != 1:
        fatal.append(f'{len(video)} video tracks')
    if not eng_audio:
        fatal.append('no English audio')
    if len(eng_audio) > 1:
        warnings.append(f'{len(eng_audio)} English audio tracks, only the first was kept')
    for t in (eng_sub, fr_sub):
        if t and 'subrip' not in t['codec'].lower() and 'srt' not in t['codec'].lower():
            warnings.append(f'subtitle {describe(t)} is not SRT ({t["codec"]})')
    if eng_sub is None:
        warnings.append('no English SRT')
    elif is_sdh(eng_sub):
        infos.append('English SRT is SDH (no plain English SRT)')
    if fr_sub is None:
        warnings.append('no French SRT')
    elif fr_sub not in fr_full:
        warnings.append(f'French SRT is forced-only ({name(fr_sub) or "?"}), no full French SRT available')
    keep = video[:1] + eng_audio[:1] + [t for t in (eng_sub, fr_sub) if t]
    return keep, eng_sub, infos, warnings, fatal


def stream_hashes(path, ids):
    """SHA-256 of the raw packets of each track, in the given order."""
    cmd = [EXE['ffmpeg'], '-v', 'error', '-i', path]
    for i in ids:
        cmd += ['-map', f'0:{i}']
    cmd += ['-c', 'copy', '-f', 'streamhash', '-hash', 'sha256', '-']
    return [line.split('=', 1)[1] for line in run(cmd).split()]


def duration(path):
    return float(run([EXE['ffprobe'], '-v', 'error', '-show_entries', 'format=duration',
                      '-of', 'csv=p=0', path]).strip())


def kept_end(path, ids):
    """End time of the kept tracks only (last packet pts + its duration)."""
    end = 0.0
    for i in ids:
        out = run([EXE['ffprobe'], '-v', 'error', '-select_streams', str(i), '-show_entries',
                   'packet=pts_time,duration_time', '-of', 'csv=p=0', path])
        for line in out.split():
            pts, _, dur = line.partition(',')
            try:
                end = max(end, float(pts) + (float(dur) if dur not in ('', 'N/A') else 0))
            except ValueError:
                pass
    return end


def remux(src, out, keep, eng_sub):
    video, audio, subs = keep[0], keep[1], keep[2:]
    cmd = [EXE['mkvmerge'], '-q', '-o', out,
           '--video-tracks', str(video['id']),
           '--audio-tracks', str(audio['id']),
           '--default-track-flag', f"{audio['id']}:1",
           '--forced-display-flag', f"{audio['id']}:0"]
    if subs:
        cmd += ['--subtitle-tracks', ','.join(str(t['id']) for t in subs)]
        for t in subs:
            cmd += ['--default-track-flag', f"{t['id']}:{1 if t is eng_sub else 0}",
                    '--forced-display-flag', f"{t['id']}:0"]
    else:
        cmd += ['--no-subtitles']
    cmd += ['--no-attachments', '--track-order', ','.join(f"0:{t['id']}" for t in keep), src]
    return subprocess.run(cmd).returncode  # 0 ok, 1 warnings, 2 error


def verify(src, out, keep, eng_sub):
    errors, warnings = [], []
    got = mkv_json(out)['tracks']
    if len(got) != len(keep):
        errors.append(f'{len(got)} tracks instead of {len(keep)}')
    else:
        for g, k in zip(got, keep):
            if (g['type'], lang(g), g['codec']) != (k['type'], lang(k), k['codec']):
                errors.append(f'track {g["id"]}: {describe(g)} instead of {describe(k)}')
            want_default = k['type'] in ('video', 'audio') or k is eng_sub
            if bool(g['properties'].get('default_track')) != want_default:
                errors.append(f'track {g["id"]}: wrong default flag')
            if g['properties'].get('forced_track'):
                errors.append(f'track {g["id"]}: forced flag set')
    d_src, d_out = duration(src), duration(out)
    if abs(d_src - d_out) > 0.1:
        # The source duration can be stretched by a dropped track (e.g. a stray
        # subtitle cue far past the end): compare with the kept tracks only.
        d_kept = kept_end(src, [t['id'] for t in keep])
        if abs(d_kept - d_out) > 0.5:
            errors.append(f'duration {d_out:.3f}s instead of {d_src:.3f}s')
        else:
            warnings.append(f'source duration {d_src:.3f}s was inflated by a dropped track; kept tracks '
                            f'end at {d_kept:.3f}s, new file {d_out:.3f}s (file verified and replaced)')
    h_src = stream_hashes(src, [t['id'] for t in keep])
    h_out = stream_hashes(out, list(range(len(keep))))
    if len(h_src) != len(h_out):
        errors.append('hash count differs')
    for k, a, b in zip(keep, h_src, h_out):
        if a != b:
            errors.append(f'content differs for {describe(k)}')
    return errors, warnings


def expand(paths):
    files = []
    for p in paths:
        if os.path.isdir(p):
            files += sorted(glob.glob(os.path.join(glob.escape(p), '*.mkv')))
        elif os.path.isfile(p):
            files.append(p)
        else:
            matches = sorted(glob.glob(p))
            if not matches:
                sys.exit(f'Nothing matches: {p}')
            files += matches
    files = [f for f in files if f.lower().endswith('.mkv') and not f.endswith('.tmp-clean.mkv')]
    return list(dict.fromkeys(os.path.abspath(f) for f in files))


def default_report(files):
    folder = os.path.dirname(files[0])
    show_dir = os.path.dirname(folder) if re.match(r'(?i)^(season|saison)\s*\d+', os.path.basename(folder)) \
        else folder
    show = re.sub(r'\s+', '_', os.path.basename(show_dir).strip())
    existing = sorted(glob.glob(os.path.join(glob.escape(show_dir), f'*-Cleanup_Report_{glob.escape(show)}_MKV.txt')))
    if existing:
        return existing[0]  # one report per show: keep appending to it
    return os.path.join(show_dir, f'{datetime.date.today():%Y%m%d}-Cleanup_Report_{show}_MKV.txt')


def main():
    args = sys.argv[1:]
    report, no_report = None, False
    if '--report' in args:
        i = args.index('--report'); report = args[i + 1]; del args[i:i + 2]
    if '--no-report' in args:
        args.remove('--no-report'); no_report = True
    if len(args) < 2 or args[0] not in ('plan', 'replace'):
        sys.exit(__doc__)
    find_tools()
    mode, files = args[0], expand(args[1:])
    if not files:
        sys.exit('No .mkv file found')

    issues, failed, saved = [], 0, 0
    for f in files:
        tracks = mkv_json(f)['tracks']
        keep, eng_sub, infos, warnings, fatal = select(tracks)
        kept_ids = {t['id'] for t in keep}
        print(f'\n== {os.path.basename(f)}')
        print('   keep   : ' + ', '.join(describe(t) for t in keep))
        print('   drop   : ' + (', '.join(describe(t) for t in tracks if t['id'] not in kept_ids) or '-'))
        for n in infos:
            print('   info   : ' + n)
        for w in warnings:
            print('   WARNING: ' + w)
            issues.append((f, 'WARNING: ' + w))
        if fatal:
            print('   ERROR  : ' + '; '.join(fatal) + ' -> file left untouched')
            issues.append((f, 'ERROR: ' + '; '.join(fatal) + ' -> file left untouched'))
            failed += 1
            continue
        if mode == 'plan':
            continue

        tmp = f[:-4] + '.tmp-clean.mkv'
        if os.path.exists(tmp):
            os.remove(tmp)
        rc = remux(f, tmp, keep, eng_sub)
        if rc >= 2:
            print(f'   ERROR  : mkvmerge rc={rc} -> original left untouched')
            issues.append((f, f'ERROR: mkvmerge rc={rc} -> original left untouched'))
            if os.path.exists(tmp):
                os.remove(tmp)
            failed += 1
            continue
        errors, vwarnings = verify(f, tmp, keep, eng_sub)
        if errors:
            print('   ERROR  : ' + '; '.join(errors) + ' -> original left untouched')
            issues.append((f, 'ERROR: ' + '; '.join(errors) + ' -> original left untouched'))
            os.remove(tmp)
            failed += 1
            continue
        for w in vwarnings + (['mkvmerge emitted warnings (file verified and replaced)'] if rc == 1 else []):
            print('   WARNING: ' + w)
            issues.append((f, 'WARNING: ' + w))
        before, after = os.path.getsize(f), os.path.getsize(tmp)
        st = os.stat(f)
        try:
            os.replace(tmp, f)
        except OSError as e:  # Windows: the file is open in a player
            print(f'   ERROR  : cannot replace the original ({e}) -> original left untouched')
            issues.append((f, f'ERROR: cannot replace the original ({e}); is it open in a player? '
                              '-> original left untouched'))
            os.remove(tmp)
            failed += 1
            continue
        os.utime(f, (st.st_atime, st.st_mtime))
        saved += before - after
        print(f'   OK     : tracks, flags, duration and SHA-256 verified; '
              f'{before / 1e6:.0f} -> {after / 1e6:.0f} MB, original replaced')

    print(f'\nTotal: {len(files)} files, {failed} failed/blocked'
          + (f', {saved / 1e9:.2f} GB saved' if mode == 'replace' else ''))
    if mode == 'replace' and issues and not no_report:
        report = report or default_report(files)
        section = os.path.basename(os.path.dirname(files[0]))
        with open(report, 'a', encoding='utf-8') as r:
            r.write(f'\n### {section} - {datetime.datetime.now():%Y-%m-%d %H:%M}\n')
            for f, n in issues:
                r.write(f'{os.path.basename(f)} : {n}\n')
        print(f'Report: {report}')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
