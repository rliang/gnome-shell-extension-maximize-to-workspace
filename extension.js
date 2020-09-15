'use strict';
const GLib = imports.gi.GLib;
const Meta = imports.gi.Meta;
const St = imports.gi.St;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Prefs = Me.imports.prefs;

const _trackedWindows = [];
const _handles = [];
const _history = {};

let _handleWorkspaceSwitch;

let _animationFactor;
let _checkWorkspaceSwitch;
let _delay;
let _expandWorkspace;
let _isAnimations;
let _isDynamic;
let _isFixedExpand;
let _isMapping;
let _isRestore;
let _isSingleMonitor;
let _isStarting;
let _lastCheckWorkspace;
let _lastExpand;
let _lastHistory;
let _lastRestore;
let _noActivate;
let _restoreHistory;

let _interfaceSettings;
let _mutterSettings;
let _settings;

function TrackedWindow(id, window) {
  this.id = id;
  this.window = window;
}

/* This has been tested with both static and dynamic workspaces.  It
 * works better with dynamic workspaces, but can work well if you have
 * enough static ones.
 */

/* Possible future options: (OO)
 *  always move to last / find first empty / find last empty
 *  target a specific desktop when none are empty
 *  (don't) skip first desktop
 */

function getInfo(act) {
  let metaWindow = null;
  let workspaceManager = null;
  try {
    metaWindow = act.meta_window;
    workspaceManager = metaWindow.get_display().get_workspace_manager();
    log('maximize-to-workspace getInfo | window: ' + metaWindow.title);
  } catch (error) {
    logError(error, '<maximize-to-workspace|getInfo>');
  }
  return [metaWindow, workspaceManager];
}

function checkMaximize(act) {
  log('maximize-to-workspace checkMaximize | noActivate: ' + _noActivate);
  const [metaWindow, workspaceManager] = getInfo(act);

  // sanity check (abort if it is not a normal window nor maximized)
  if (
    !metaWindow ||
    !workspaceManager ||
    metaWindow.on_all_workspaces ||
    metaWindow.window_type !== Meta.WindowType.NORMAL ||
    metaWindow.get_maximized() !== Meta.MaximizeFlags.BOTH
    ) {
      return;
  }

  let lastWorkspace = workspaceManager.get_n_workspaces() - 1;

  if (
    ((lastWorkspace == 0) && !_isDynamic) ||
    (_isSingleMonitor && !metaWindow.is_on_primary_monitor())
    ) {
      return;
  }

  let windowList = metaWindow.get_workspace()
    .list_windows()
    .filter(w =>
      w !== metaWindow &&
      !w.is_on_all_workspaces() &&
      w.get_monitor() == metaWindow.get_monitor()
    );
  
  if ((_isRestore && _restoreHistory && !_noActivate) || _isStarting) {
    let id = metaWindow.get_id();
    _history[id] = metaWindow.get_workspace().index();
    log('maximize-to-workspace checkMaximize | w.Id: ' + id);
    log('maximize-to-workspace checkMaximize | index: ' + _history[id] +
    ' h.length: ' + Object.keys(_history).length);
    
    let trackedWindow = _trackedWindows
      .filter(w =>
        w.id == id
      );
    if (trackedWindow.length == 0) {
      let mutterWindow = metaWindow.get_compositor_private();
      if (mutterWindow) {
        trackedWindow = new TrackedWindow(id, mutterWindow);
        trackedWindow._destroyId = mutterWindow.connect('destroy', source => {
          handleDestroy(source, trackedWindow);
        });
        _trackedWindows.push(trackedWindow);
      }
    }
  }

  // continue only if exists any other window in the current workspace
  if (windowList && windowList.length > 0) {
    // put on last workspace if all else fails (OO)
    if (lastWorkspace < 1) {
      lastWorkspace = 1;
    }
    log('maximize-to-workspace checkMaximize | lastWorkspace: ' + lastWorkspace);
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

    if (_isFixedExpand) {
      _expandWorkspace = lastWorkspace;
      log('maximize-to-workspace checkMaximize | expandWorkspace: ' + _expandWorkspace);
      emptyWorkspace = _expandWorkspace;
    }

    // don't try to move it if we're already here (break recursion)
    if (emptyWorkspace == metaWindow.get_workspace().index()) {
      return;
    }

    // move window and activate workspace
    moveWindow(metaWindow, emptyWorkspace, workspaceManager);

    log('maximize-to-workspace checkMaximize | end window: ' + metaWindow.title);
  }
}

function moveWindow(metaWindow, workspace, workspaceManager) {
  log('maximize-to-workspace moveWindow start | window: ' + metaWindow.title);

  _isDynamic ?
    metaWindow.change_workspace_by_index(workspace, true) :
    metaWindow.change_workspace_by_index(workspace, false);

  if (_noActivate || _isStarting) {
    if (_isDynamic && !_isFixedExpand) {
      workspaceManager.append_new_workspace(false, global.get_current_time());
    }
    log('maximize-to-workspace moveWindow end | window: ' + metaWindow.title);
    return;
  }
  GLib.timeout_add(
    GLib.PRIORITY_LOW,
    _delay,
    () => {
      workspaceManager.get_workspace_by_index(workspace)
        .activate_with_focus(metaWindow, global.get_current_time());
      log('maximize-to-workspace moveWindow end | window: ' + metaWindow.title);
      return GLib.SOURCE_REMOVE;
  });
}

function checkRestore(act) {
  log('maximize-to-workspace checkRestore');
  const [metaWindow, workspaceManager] = getInfo(act);

  if (
    !metaWindow ||
    !workspaceManager ||
    metaWindow.on_all_workspaces ||
    !_isRestore ||
    metaWindow.window_type !== Meta.WindowType.NORMAL
    ) {
    return;
  }

  if (
    _isSingleMonitor &&
    !metaWindow.is_on_primary_monitor()
    ) {
      checkHistory(metaWindow);
      return;
  }

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
    _delay + 200,
    () => {
      type ? checkMaximize(act) : checkRestore(act);
      _isMapping = null;
      return GLib.SOURCE_REMOVE;
  });
}

function handleDestroy(source, trackedWindow) {
  let id = trackedWindow.id;
  log('maximize-to-workspace handleDestroy | w.id: ' + id);
  let index = _history[id];
  log('maximize-to-workspace handleDestroy | h: ' + JSON.stringify(_history));
  if (index != undefined) {
    log('maximize-to-workspace handleDestroy | h.delete: ' + id);
    delete _history[id];
  }
  id = trackedWindow._destroyId
  log('maximize-to-workspace handleDestroy | d.id: ' + id);
  if (id != undefined && source) {
    try {
      source.disconnect(id);
      index = _trackedWindows.indexOf(trackedWindow);
      log('maximize-to-workspace handleDestroy | index: ' + index);
      _trackedWindows.splice(index, 1);
    } catch (error) {
      logError(error, '<maximize-to-workspace|handleDestroy>');
    }
  }
  log('maximize-to-workspace handleDestroy | tw.length: ' + _trackedWindows.length);
}

function clearTrackedWindows() {
  if (_trackedWindows.length) {
    try {
      _trackedWindows.splice(0).forEach(w => {
        if (w._destroyId) {
          w.window.disconnect(w._destroyId);
        }
      });
    } catch (error) {
      logError(error, '<maximize-to-workspace|clearTrackedWindows>');
    }
  }
  log('maximize-to-workspace clearTrackedWindows | tw.length: ' + _trackedWindows.length);
}

function checkHistory(metaWindow) {
  log('maximize-to-workspace checkHistory | window' + metaWindow.title);
  if (!Object.keys(_history).length) {
    return null;
  }
  log('maximize-to-workspace checkHistory | h: ' + JSON.stringify(_history));
  let id = metaWindow.get_id();
  let index = _history[id];
  if (index != undefined) {
    log('maximize-to-workspace checkHistory | h.delete: ' + id);
    delete _history[id];
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

  _isSingleMonitor = _settings.get_boolean(Prefs.SETTINGS_SINGLE_MONITOR);
  _isRestore = _settings.get_boolean(Prefs.SETTINGS_RESTORE);
  _isFixedExpand = _settings.get_boolean(Prefs.SETTINGS_EXPAND);
  _checkWorkspaceSwitch = _settings.get_boolean(Prefs.SETTINGS_CHECK_SWITCH);
  _restoreHistory = _settings.get_enum(Prefs.SETTINGS_RESTORE_MODE);

  if (_isFixedExpand !== _lastExpand) {
    _expandWorkspace = null;
    _lastExpand = _isFixedExpand;
  }
  
  if (_checkWorkspaceSwitch !== _lastCheckWorkspace) {
    handleWorkspaceSwitch(_checkWorkspaceSwitch);
    _lastCheckWorkspace = _checkWorkspaceSwitch;
  }

  if ((_restoreHistory != _lastHistory) || (_isRestore !== _lastRestore)) {
    clearHistory();
    _lastRestore = _isRestore;
    _lastHistory = _restoreHistory;
  }

  log('maximize-to-workspace updateSettings | restore: ' + _isRestore +
  ' restoreHist: ' + _restoreHistory +
  ' expand: ' + _isFixedExpand +
  ' singleMonitor: ' + _isSingleMonitor +
  ' h.length: ' + Object.keys(_history).length);
  
}

function updateSystemSettings() {
  _isDynamic = _mutterSettings.get_boolean('dynamic-workspaces');
  _isAnimations = _interfaceSettings.get_boolean('enable-animations');
  _animationFactor = St.Settings.get().slow_down_factor;

  _delay = Math.round((_isAnimations ? 1 : 0) * _animationFactor * 300) + 100;
  log('maximize-to-workspace updateSettings | delay: ' + _delay);

  log('maximize-to-workspace updateSettings | GS.animations: ' +
    _isAnimations + ' | St.animations: ' +
    St.Settings.get().enable_animations + ' | animation.factor: ' +
    _animationFactor);
}

function handleWorkspaceSwitch(enable) {
  // handle signal 'switch-workspace'
  if (enable) {
    _handleWorkspaceSwitch = global.window_manager.connect('switch-workspace', () => {
      const acts = global.get_window_actors()
        .filter(a => a.meta_window.has_focus());
      log('maximize-to-workspace switch-workspace | w.length: ' + acts.length);
      if (acts.length) {
        _noActivate = true;
        log('maximize-to-workspace switch-workspace | w1: ' + 
          acts[0].meta_window.title + ' noActivate: ' + _noActivate);
        checkMaximize(acts[0]);
        _noActivate = false;
        log('maximize-to-workspace switch-workspace | w2: ' + 
          acts[0].meta_window.title + ' noActivate: ' + _noActivate);
      }
    });
  } else {
    if (_handleWorkspaceSwitch) {
      global.window_manager.disconnect(_handleWorkspaceSwitch);
      _handleWorkspaceSwitch = null;
    }
  }
}

function init() {}

function enable() {
  _isStarting = true;
  // log('maximize-to-workspace enable');
  
  // load system settings and connect signals
  _mutterSettings = ExtensionUtils.getSettings('org.gnome.mutter');
  _handles.push(_mutterSettings.connect('changed', updateSystemSettings));
  _interfaceSettings = ExtensionUtils.getSettings('org.gnome.desktop.interface');
  _handles.push(_interfaceSettings.connect('changed', updateSystemSettings));
  updateSystemSettings();
  
  // load settings and connect signal
  _settings = ExtensionUtils.getSettings();
  _handles.push(_settings.connect('changed', updateSettings));
  updateSettings();

  log('maximize-to-workspace enable | handles: ' + _handles.length +
    ' h.length: ' + Object.keys(_history).length);

  // when started, check all current windows
  global.get_window_actors().forEach(checkMaximize);

  // handle signal 'map' (new windows)
  _handles.push(global.window_manager.connect('map', (_, act) => {
    log('maximize-to-workspace map | window: ' + act.meta_window.title +
      ' isMapping: ' + _isMapping);
    if (_isMapping && (_isMapping == act.meta_window.get_id())) {
      return;
    }
    _isMapping = act.meta_window.get_id();
    runDelayed(act, 1);
    log('maximize-to-workspace map | window: ' + act.meta_window.title +
      ' isMapping: ' + _isMapping);
  }));

  // handle signal 'size-change'
  _handles.push(global.window_manager.connect('size-change', (_, act, change) => {
    log('maximize-to-workspace size-change | window: ' + act.meta_window.title +
      ' isMapping: ' + _isMapping);
    if (_isMapping && (_isMapping == act.meta_window.get_id())) {
      return;
    }
    _isMapping = act.meta_window.get_id();
    if (change === Meta.SizeChange.MAXIMIZE) {
      runDelayed(act, 1);
    } else if (change === Meta.SizeChange.UNMAXIMIZE) {
      runDelayed(act, 0);
    }
  }));

  _isStarting = false;
}

function disable() {
  // log('maximize-to-workspace disable');

  // disconnect from all signals
  _handles.splice(0).forEach((key, i) => {
    switch (i) {
      case 0:
        _mutterSettings.disconnect(key);
        _mutterSettings = null;
        break;
      case 1:
        _interfaceSettings.disconnect(key);
        _interfaceSettings = null;
        break;
      case 2:
        _settings.disconnect(key);
        _settings = null;
        break;
      default:
        global.window_manager.disconnect(key);
      }
  });

  handleWorkspaceSwitch(false);

  clearHistory();

  clearTrackedWindows();
}
