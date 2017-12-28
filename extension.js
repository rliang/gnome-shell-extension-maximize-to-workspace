const Meta = imports.gi.Meta;

/* This has been tested with both static and dynamic workspaces.  It
 * works better with dynamic workspaces, but can work well if you have
 * enough static ones.
 */

/* Possible future options: (OO)
 *  always move to last / find first empty / find last empty
 *  target a specific desktop when none are empty
 *  (don't) skip first desktop
 */
function check(act) {
  const win = act.meta_window;
  const screen = win.get_screen();
  if (win.window_type !== Meta.WindowType.NORMAL)
    return;
  if (win.get_maximized() !== Meta.MaximizeFlags.BOTH)
    return;
  w = win.get_workspace().list_windows()
    .filter(w => w !== win && !w.is_always_on_all_workspaces());
  if (w.length>= 1) {
    // put on last workspace if all else fails (OO)
    lastworkspace = screen.get_n_workspaces()-1
    // always start with the second workspace (OO)
    if (lastworkspace<1) lastworkspace=1
    for (emptyworkspace=1 ; emptyworkspace<lastworkspace; emptyworkspace++){
      wc = screen.get_workspace_by_index(emptyworkspace).list_windows().filter(w=>!w.is_always_on_all_workspaces()).length
      if (wc<1	) break;
    }
    // don't try to move it if we're already here (break recursion)
    if (emptyworkspace == win.get_workspace().index())
      return;
    win.change_workspace_by_index(emptyworkspace,1)
    screen.get_workspace_by_index(emptyworkspace).activate(global.get_current_time())
  }
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
