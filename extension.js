const Meta = imports.gi.Meta;

function refresh(win) {
  if (win.get_maximized() === Meta.MaximizeFlags.BOTH)
    win.get_workspace()
        .list_windows()
        .filter(w => w !== win)
        .reduce((first, w) => {
          w.change_workspace_by_index(win.get_workspace().index() + 1, first);
          return false;
        }, true);
}

let _handle_disp;
let _handle_wins = {};

function start(win) {
  if (win.window_type !== Meta.WindowType.NORMAL)
    return;
  refresh(win);
  const sigs = [
    'notify::maximized-horizontally', 'notify::maximized-vertically',
    'workspace-changed'
  ];
  _handle_wins[win.get_stable_sequence()] =
      sigs.map(sig => win.connect(sig, refresh))
          .concat(win.connect('unmanaged', stop));
}

function stop(win) {
  const id = win.get_stable_sequence();
  (_handle_wins[id] || []).forEach(handle => win.disconnect(handle));
  delete _handle_wins[id];
}

function enable() {
  global.get_window_actors().map(a => a.meta_window).forEach(start);
  _handle_disp = global.display.connect('window-created', (d, w) => start(w));
}

function disable() {
  global.get_window_actors().map(a => a.meta_window).forEach(stop);
  global.display.disconnect(_handle_disp);
}
