// Regression test: closing an office preview while LibreOffice still converts
// kills the conversion; its exit callback then loaded a NULL pdf path
// (criticals, and a use-after-free before the pdf_path fix).
// Usage: G_DEBUG=fatal-criticals cjs pdf-loader-cancel-conversion.js <file:// uri of an office document>
// Exit code 0 = pass. A critical aborts the process (exit 133 or 134).
imports.gi.versions.Gtk = '3.0';
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const System = imports.system;
const EvDoc = imports.gi.XreaderDocument;
const NemoPreview = imports.gi.NemoPreview;

const CANCEL_AFTER_MS = 300;
const SETTLE_S = 5;
const uri = ARGV[0];
let loop = new GLib.MainLoop(null, false);

Gtk.init(null);
EvDoc.init();

let loader = new NemoPreview.PdfLoader();
loader.uri = uri;
print('step: conversion started');

GLib.timeout_add(GLib.PRIORITY_DEFAULT, CANCEL_AFTER_MS, () => {
    // same sequence as DocumentWindow._onDestroy
    loader.cleanup_document();
    loader = null;
    System.gc();
    print('step: preview closed during conversion');
    return GLib.SOURCE_REMOVE;
});

GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, SETTLE_S, () => {
    print('step: settled, the verdict is the exit code');
    loop.quit();
    return GLib.SOURCE_REMOVE;
});

loop.run();
System.exit(0);
