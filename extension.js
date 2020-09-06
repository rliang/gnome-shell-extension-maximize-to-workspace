'use strict';
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
  const metaWindow = act.meta_window;
  const workspaceManager = metaWindow.get_display().get_workspace_manager();
  // log('maximize-to-workspace check | window: ' + metaWindow.title);

  // abort if it is not a normal window nor maximized
  if (
    metaWindow.window_type !== Meta.WindowType.NORMAL ||
    metaWindow.get_maximized() !== Meta.MaximizeFlags.BOTH
    ) {
      return;
    }

  let windowList = metaWindow.get_workspace()
    .list_windows()
    .filter(w => w !== metaWindow && !w.is_on_all_workspaces());
  
  // continue only if exists any other window in the current workspace
  if (windowList && windowList.length > 0) {
    // put on last workspace if all else fails (OO)
    let lastWorkspace = workspaceManager.get_n_workspaces() - 1;
    if (lastWorkspace < 1) {
      lastWorkspace = 1;
    }
      
    // always start with the second workspace (OO)
    let emptyWorkspace = 1;

    // find the first workspace, or use last one if there is none
    while (emptyWorkspace < lastWorkspace) {
      windowList = workspaceManager.get_workspace_by_index(emptyWorkspace)
        .list_windows()
        .filter(w => !w.is_on_all_workspaces());
      if (windowList.length < 1) {
        break;
        }
      emptyWorkspace++;
    }
    // don't try to move it if we're already here (break recursion)
    if (emptyWorkspace == metaWindow.get_workspace().index()) {
      return;
    }

    // move windows and activate workspace
    metaWindow.change_workspace_by_index(emptyWorkspace, false);
    workspaceManager.get_workspace_by_index(emptyWorkspace)
      .activate(global.get_current_time());
  }
}

const _handles = [];

function enable() {
  //log('maximize-to-workspace enable');

  // when started, check all current windows
  global.get_window_actors().forEach(check);

  // handle 'map' (new windows)
  _handles.push(global.window_manager.connect('map', (_, act) => check(act)));

  // handle signal 'size-change'
  _handles.push(global.window_manager.connect('size-change', (_, act, change) => {
    if (change === Meta.SizeChange.MAXIMIZE) {
      check(act);
    }
  }));

  // handle signal 'switch-workspace'
  _handles.push(global.window_manager.connect('switch-workspace', () => {
    const acts = global.get_window_actors()
      .filter(a => a.meta_window.has_focus());
    if (acts.length) {
      check(acts[0]);
    }
  }));
}

function disable() {
  // log('maximize-to-workspace disable');

  // disconnect from all signals
  _handles.splice(0).forEach(h => global.window_manager.disconnect(h));
}
