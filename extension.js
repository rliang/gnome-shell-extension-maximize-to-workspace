const Meta = imports.gi.Meta;

function check(act) {
  const win = act.meta_window;
  if (win.window_type !== Meta.WindowType.NORMAL)
    return;
  if (win.get_maximized() !== Meta.MaximizeFlags.BOTH)
    return;
  win.get_workspace().list_windows()
    .filter(w => w !== win)
    .reduce((isFirst, w) => {
      w.change_workspace_by_index(win.get_workspace().index() + 1, isFirst);
      return false;
    }, true);
}

const _handles = [];

function enable() {
  global.get_window_actors().forEach(check);
  _handles.push(global.window_manager.connect('map', (_, act) => check(act)));
  _handles.push(global.window_manager.connect('size-change', (_, act, change) => {
    if (change === Meta.SizeChange.MAXIMIZE)
      check(act);
  }));
  _handles.push(global.window_manager.connect('switch-workspace', () => {
    const acts = global.get_window_actors()
      .filter(a => a.meta_window.has_focus());
    if (acts.length)
      check(acts[0]);
  }));
}

function disable() {
  _handles.splice(0).forEach(h => global.window_manager.disconnect(h));
}
