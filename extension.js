'use strict';
const Meta = imports.gi.Meta;
const GLib = imports.gi.GLib;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Prefs = Me.imports.prefs;

const _handles = [];
const _history = {};

let _checkWorkspace;
let _expand;
let _expandWorkspace;
let _isStarting;
let _lastExpand;
let _lastHistory;
let _lastRestore;
let _settings;
let _restore;
let _restoreHistory;
let _singleMonitor;

/* This has been tested with both static and dynamic workspaces.  It
 * works better with dynamic workspaces, but can work well if you have
 * enough static ones.
 */

/* Possible future options: (OO)
 *  always move to last / find first empty / find last empty
 *  target a specific desktop when none are empty
 *  (don't) skip first desktop
 */
function checkMaximize(act) {
  const metaWindow = act.meta_window;
  log('maximize-to-workspace checkMaximize | start: ' + _isStarting);

  // abort if it is not a normal window nor maximized
  if (
    !metaWindow ||
    metaWindow.on_all_workspaces ||
    metaWindow.window_type !== Meta.WindowType.NORMAL ||
    metaWindow.get_maximized() !== Meta.MaximizeFlags.BOTH
    ) {
      return;
  }
  log('maximize-to-workspace checkMaximize | window: ' + metaWindow.title);

  if (
    _singleMonitor &&
    !metaWindow.is_on_primary_monitor()
    ) {
      return;
  }

  const workspaceManager = metaWindow.get_display().get_workspace_manager();
  if (!workspaceManager) {
    return;
  }

  let windowList = metaWindow.get_workspace()
    .list_windows()
    .filter(w =>
      w !== metaWindow &&
      !w.is_on_all_workspaces() &&
      w.get_monitor() == metaWindow.get_monitor()
    );
  
  
  if (_restore && _restoreHistory) {
    _history[metaWindow.get_id()] = metaWindow.get_workspace().index();
    log('maximize-to-workspace checkMaximize | windowId: ' + metaWindow.get_id());
    log('maximize-to-workspace checkMaximize | _history.length: ' +
      Object.keys(_history).length);
  }

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
      log('maximize-to-workspace checkMaximize | w.length: ' + windowList.length);
      if (windowList.length < 1) {
        break;
        }
      emptyWorkspace++;
    }

    log('maximize-to-workspace checkMaximize | emptyWorkspace: ' + emptyWorkspace);

    // don't try to move it if we're already here (break recursion)
    if (emptyWorkspace == metaWindow.get_workspace().index()) {
      return;
    }

    if (_expand) {
      if (_expandWorkspace == null || _isStarting) {
        _expandWorkspace = emptyWorkspace;
      }
      emptyWorkspace = _expandWorkspace;
    }

    // move window and activate workspace
    moveWindow(metaWindow, emptyWorkspace, workspaceManager);

    log('maximize-to-workspace checkMaximize | end window: ' + metaWindow.title);
  }
}

function moveWindow(metaWindow, workspace, workspaceManager) {
  log('maximize-to-workspace moveWindow start | window: ' + metaWindow.title);
  metaWindow.change_workspace_by_index(workspace, true);
  if (_isStarting) {
    workspaceManager.get_workspace_by_index(workspace)
      .activate(global.get_current_time());
    log('maximize-to-workspace moveWindow end | window: ' + metaWindow.title);
    return;
  }
  GLib.timeout_add(
    GLib.PRIORITY_LOW,
    300,
    () => {
      workspaceManager.get_workspace_by_index(workspace)
        .activate_with_focus(metaWindow, global.get_current_time());
      log('maximize-to-workspace moveWindow end | window: ' + metaWindow.title);
      return GLib.SOURCE_REMOVE;
  });
}

function checkRestore(act) {
  const metaWindow = act.meta_window;
  log('maximize-to-workspace checkRestore | window: ' + metaWindow.title);

  if (
    !metaWindow ||
    metaWindow.on_all_workspaces ||
    !_restore ||
    metaWindow.window_type !== Meta.WindowType.NORMAL
    ) {
    return;
  }

  if (
    _singleMonitor &&
    !metaWindow.is_on_primary_monitor()
    ) {
      checkHistory(metaWindow);
      return;
  }

  const workspaceManager = metaWindow.get_display().get_workspace_manager();
  let restoreWorkspace = null;

  if (_restoreHistory) {
    restoreWorkspace = checkHistory(metaWindow);
  } else {
    restoreWorkspace = 0;
  }
  log('maximize-to-workspace checkRestore | restoreWorkspace.1: ' + restoreWorkspace);

  if (
    restoreWorkspace != null &&
    restoreWorkspace < workspaceManager.get_n_workspaces() &&
    restoreWorkspace != metaWindow.get_workspace().index()
    ) {
    log('maximize-to-workspace checkRestore | restoreWorkspace.2: ' + restoreWorkspace);
    moveWindow(metaWindow, restoreWorkspace, workspaceManager);
  }
}

function runDelayed(act, type) {
  GLib.timeout_add(
    GLib.PRIORITY_LOW,
    500,
    () => {
      type ? checkMaximize(act) : checkRestore(act);
      return GLib.SOURCE_REMOVE;
  });
}

function checkHistory(metaWindow) {
  if (!_history) {
    return null;
  }
  let index = metaWindow.get_id();
  index = _history[index];
  log('maximize-to-workspace checkHistory | index: ' + index);
  if (index != undefined) {
    delete _history[index];
    return index;
  }
  return null;
}

function clearHistory() {
  log('maximize-to-workspace clearHistory | history: ' + JSON.stringify(_history));
  if (Object.keys(_history).length) {
    Object.keys(_history).forEach(key => delete _history[key]);
  }
}
// update variables from settings
function updateSettings() {
  log('maximize-to-workspace updateSettings | lastRestore: ' + _lastRestore +
    '  lastHistory: ' + _lastHistory +
    '  lastExpand: ' + _lastExpand);
  _singleMonitor = _settings.get_boolean(Prefs.SETTINGS_SINGLE_MONITOR);
  _restore = _settings.get_boolean(Prefs.SETTINGS_RESTORE);
  _expand = _settings.get_boolean(Prefs.SETTINGS_EXPAND);
  _restoreHistory = _settings.get_enum(Prefs.SETTINGS_RESTORE_MODE);

  if (_expand != _lastExpand) {
    _expandWorkspace = null;
    _lastExpand = _expand;
  }

  if ((_restoreHistory != _lastHistory) || (_restore != _lastRestore)) {
    clearHistory();
    _lastRestore = _restore;
    _lastHistory = _restoreHistory;
  }

  log('maximize-to-workspace updateSettings | restore: ' + _restore +
    '  singleMonitor: ' + _singleMonitor +
    '  restoreHist: ' + _restoreHistory +
    '  expand: ' + _expand +
    ' _history: ' + Object.keys(_history).length);
}

function enable() {
  _isStarting = true;
  // log('maximize-to-workspace enable');

  // load settings and connect signal
  _settings = ExtensionUtils.getSettings();
  _handles.push(_settings.connect('changed', updateSettings));
  updateSettings();
  log('maximize-to-workspace enable | _handles: ' + _handles.length +
    ' _history: ' + Object.keys(_history).length);

  // when started, check all current windows
  global.get_window_actors().forEach(checkMaximize);

  // handle signal 'map' (new windows)
  _handles.push(global.window_manager.connect('map', (_, act) => runDelayed(act, 1)));

  // handle signal 'size-change'
  _handles.push(global.window_manager.connect('size-change', (_, act, change) => {
    if (change === Meta.SizeChange.MAXIMIZE) {
      runDelayed(act, 1);
    } else if (change === Meta.SizeChange.UNMAXIMIZE) {
      runDelayed(act, 0);
    }
  }));

  // handle signal 'switch-workspace'
  if (_checkWorkspace) {
    _handles.push(global.window_manager.connect('switch-workspace', () => {
      const acts = global.get_window_actors()
        .filter(a => a.meta_window.has_focus());
      if (acts.length) {
        checkMaximize(acts[0]);
      }
    }));
  }

  _isStarting = false;
}

function disable() {
  // log('maximize-to-workspace disable');

  // disconnect from all signals
  _handles.splice(0).forEach((key, i) => {
    if (i) {
      global.window_manager.disconnect(key);
    } else {
      _settings.disconnect(key);
    }
  });

  clearHistory();
}
