// Regression test: closing an office preview calls cleanup_document(), then
// dispose calls it again. Before the fix this freed pdf_path twice and aborted.
// Usage: cjs pdf-loader-double-free.js <file:// uri of an office document>
// Exit code 0 = pass. The double free aborts at runtime teardown (exit 134).
imports.gi.versions.Gtk = '3.0';
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const System = imports.system;
const EvDoc = imports.gi.XreaderDocument;
const NemoPreview = imports.gi.NemoPreview;

const TIMEOUT_S = 90;
const uri = ARGV[0];
let loop = new GLib.MainLoop(null, false);
let failed = true;

Gtk.init(null);
EvDoc.init();
print('step: init done');

let loader = new NemoPreview.PdfLoader();
loader.connect('notify::document', () => {
    if (!loader.document) {
        printerr('FAIL: no document for ' + uri);
        loop.quit();
        return;
    }

    print('step: document loaded');
    loader.cleanup_document();
    print('step: cleanup done');
    // same sequence as DocumentWindow._onDestroy: drop the loader, let GC dispose it
    loader = null;
    System.gc();
    System.gc();
    print('step: loader collected');

    print('step: done, the verdict is the exit code (0 pass, 134 double free)');
    failed = false;
    loop.quit();
});
loader.uri = uri;

GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, TIMEOUT_S, () => {
    printerr('FAIL: timed out after ' + TIMEOUT_S + ' s loading ' + uri);
    loop.quit();
    return GLib.SOURCE_REMOVE;
});

loop.run();
System.exit(failed ? 1 : 0);
