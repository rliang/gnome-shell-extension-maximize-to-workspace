const Meta = imports.gi.Meta;
const Mainloop = imports.mainloop;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

function connect(object, signal, cb) {
  if (!object['__' + Me.uuid])
    object['__' + Me.uuid] = [];
  object['__' + Me.uuid].push(object.connect(signal, cb));
}

function disconnect(object) {
  if (object['__' + Me.uuid])
    object['__' + Me.uuid].forEach(h => object.disconnect(h));
  delete object['__' + Me.uuid];
}

function windowCheck(win) {
  if (win.get_maximized() !== Meta.MaximizeFlags.BOTH)
    return;
  let ws = win.get_workspace();
  ws.list_windows()
    .filter(w => w !== win)
    .forEach(w => w.change_workspace_by_index(ws.index() + 1, true));
}

function windowSetup(win) {
  if (win.window_type !== Meta.WindowType.NORMAL)
    return;
  windowCheck(win);
  ['notify::maximized-horizontally', 'notify::maximized-vertically', 'workspace-changed']
    .forEach(s => connect(win, s, () => windowCheck(win)));
}

function enable() {
  global.get_window_actors().map(a => a.meta_window).forEach(windowSetup);
  connect(global.display, 'window-created', (d, w) => windowSetup(w));
}

function disable() {
  global.get_window_actors().map(a => a.meta_window).forEach(disconnect);
  disconnect(global.display);
}
