Status: DONE

# Dracula window buttons for Thunderbird and Firefox

Files `cinnamon/theme/userChrome.css` and `cinnamon/theme/install.sh`, Thunderbird 153 and
Firefox 160, Cinnamon 6.4, X11.
Install and undo: [`cinnamon/THEME.md`](../../cinnamon/THEME.md), section "Thunderbird and
Firefox window buttons".

## Problem

Thunderbird and Firefox draw their own title bar, with tabs next to the close, minimize and
maximize buttons. The window manager theme does not reach those buttons, so they keep the
GTK default look instead of the Dracula dots used by every other window.

## Rejected routes

- System title bar: `mail.tabs.drawInTitlebar=false` in Thunderbird, or the "Title Bar" option
  in Firefox. The Dracula buttons come back only by adding a full window title bar, which loses
  the compact bar the user wants.
- `widget.gtk.non-native-titlebar-buttons.enabled`: no longer exists in Thunderbird 153.

## Chosen design

A versioned `userChrome.css` swaps in the Dracula dot images through relative
`dracula-assets/<name>.svg` URLs. An installer links it, and the theme assets folder, into
each profile's `chrome/` folder, and enables `toolkit.legacyUserProfileCustomizations.stylesheets`
in `user.js`. Validated answer: "Put it under cinnamon/".

```
dotfiles/
├── cinnamon/
│   ├── THEME.md            + section, install, undo
│   └── theme/
│       ├── userChrome.css
│       └── install.sh
├── scripts/
│   └── mozilla-install-test.sh
└── CLAUDE.md               + 1 structure line

<profile>/chrome/
├── userChrome.css  -> <repo>/cinnamon/theme/userChrome.css
└── dracula-assets  -> ~/.themes/Dracula/assets
```

## Verified fact

When `chrome/userChrome.css` is a symlink, Firefox resolves its relative URLs against the
profile's `chrome/` folder, not against the link target. Checked with strace on a throwaway
headless profile. This is why the assets folder is linked next to the stylesheet.

## Follow-up

- #72: share `say`, `link` and `backup_path` between this installer and `claude/install.sh`.
