'use strict';
/* Gnome lib imports */
const { GLib, Meta } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;
/* Extension imports */
const Me = ExtensionUtils.getCurrentExtension();
const { WindowTracker } = Me.imports.src.windowTracker;
/* Constants */
const M = 'WindowManager';
/* exported WindowManager */
var WindowManager = class WindowManager {
  constructor() {
    Me.log(M, 'init');
    this._handles = [];                       // Signal handles
    this._history = {};                       // Restore history

    this._handleWorkspaceSwitch = undefined;  // Workspace switch handle

    this._delay = undefined;                  // Delay needed to avoid errors/crashes
    this._expandWorkspace = undefined;        // Workspace used for expanding windows
    this._isDynamic = undefined;              // True if workspaces are dynamic (system)
    this._isFixedExpand = undefined;          // Setting = fixed workspace to expand
    this._isMapping = undefined;              // Has the ID of a window being managed
    this._isRestore = undefined;              // Setting = window must be restored
    this._isSingleMonitor = undefined;        // Setting = restrict to main monitor
    this._isStarting = undefined;             // True while manager is starting
    this._noActivate = undefined;             // True if window must not be activated
    this._useRestoreHistory = undefined;      // Setting = restore to original workspace
                                              // if true or the first one otherwise
    this._windowTracker = new WindowTracker(this);
  }

  // Get window/workspace info, try/catch is used as window may not exist anymore
  getInfo(act) {
    let metaWindow = null;
    let workspaceManager = null;
    try {
      metaWindow = act.meta_window;
      workspaceManager = metaWindow.get_display().get_workspace_manager();
      Me.log(M, 'getInfo | window: ' + metaWindow.title);
    } catch {
      Me.logError(M, 'getInfo');
    }
    return [metaWindow, workspaceManager];
  }

  // Check and manage windows
  checkMaximize(act) {
    Me.log(M, 'checkMaximize | noActivate: ' + this._noActivate);
    const [metaWindow, workspaceManager] = this.getInfo(act);

    // sanity check
    if (
      !metaWindow ||
      !workspaceManager ||
      metaWindow.on_all_workspaces ||
      metaWindow.get_maximized() !== Meta.MaximizeFlags.BOTH
      ) {
        return;
    }

    let lastWorkspace = workspaceManager.get_n_workspaces() - 1;

    if (
      ((lastWorkspace == 0) && !this._isDynamic) ||
      (this._isSingleMonitor && !metaWindow.is_on_primary_monitor())
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
    
    if ((this._isRestore && this._useRestoreHistory && !this._noActivate) || this._isStarting) {
      let id = metaWindow.get_id();
      this._history[id] = metaWindow.get_workspace().index();
      Me.log(M, 'checkMaximize | w.Id: ' + id);
      Me.log(M, 'checkMaximize | index: ' + this._history[id] +
      ' h.length: ' + Object.keys(this._history).length);
      
      if (!this._windowTracker.isTracked(id)) {
        this._windowTracker.add(id, metaWindow.get_compositor_private());
      }
    }

    // continue only if exists any other window in the current workspace
    if (windowList && windowList.length > 0) {
      // put on last workspace if all else fails (OO)
      if (lastWorkspace < 1) {
        lastWorkspace = 1;
      }
      Me.log(M, 'checkMaximize | lastWorkspace: ' + lastWorkspace);
      // always start with the second workspace (OO)
      let emptyWorkspace = 1;

      // find the first workspace, or use last one if there is none
      while (emptyWorkspace < lastWorkspace) {
        windowList = workspaceManager.get_workspace_by_index(emptyWorkspace)
          .list_windows()
          .filter(w => !w.is_on_all_workspaces());
        Me.log(M, 'checkMaximize | w.length: ' + windowList.length);
        if (windowList.length < 1) {
          break;
          }
        emptyWorkspace++;
      }

      Me.log(M, 'checkMaximize | emptyWorkspace: ' + emptyWorkspace);

      if (this._isFixedExpand) {
        this._expandWorkspace = lastWorkspace;
        Me.log(M, 'checkMaximize | expandWorkspace: ' + this._expandWorkspace);
        emptyWorkspace = this._expandWorkspace;
      }

      // don't try to move it if we're already here (break recursion)
      if (emptyWorkspace == metaWindow.get_workspace().index()) {
        return;
      }

      // move window and activate workspace
      this.moveWindow(metaWindow, emptyWorkspace, workspaceManager);

      Me.log(M, 'checkMaximize | end window: ' + metaWindow.title);
    }
  }

  // MOve window to another workspace, activate it or not
  moveWindow(metaWindow, workspace, workspaceManager) {
    Me.log(M, 'moveWindow start | window: ' + metaWindow.title);

    this._isDynamic ?
      metaWindow.change_workspace_by_index(workspace, true) :
      metaWindow.change_workspace_by_index(workspace, false);

    if (this._noActivate || this._isStarting) {
      if (this._isDynamic && !this._isFixedExpand) {
        workspaceManager.append_new_workspace(false, global.get_current_time());
      }
      Me.log(M, 'moveWindow end | window: ' + metaWindow.title);
      return;
    }
    GLib.timeout_add(
      GLib.PRIORITY_LOW,
      this._delay,
      () => {
        workspaceManager.get_workspace_by_index(workspace)
          .activate_with_focus(metaWindow, global.get_current_time());
        Me.log(M, 'moveWindow end | window: ' + metaWindow.title);
        return GLib.SOURCE_REMOVE;
    });
  }

  // Checks when window is "unmaximized" = restored to previous size
  checkRestore(act) {
    Me.log(M, 'checkRestore');
    const [metaWindow, workspaceManager] = this.getInfo(act);

    if (
      !metaWindow ||
      !workspaceManager ||
      metaWindow.on_all_workspaces ||
      !this._isRestore
      ) {
      return;
    }

    if (
      this._isSingleMonitor &&
      !metaWindow.is_on_primary_monitor()
      ) {
        this.checkHistory(metaWindow);
        return;
    }

    let restoreWorkspace = null;

    if (this._useRestoreHistory) {
      restoreWorkspace = this.checkHistory(metaWindow);
    } else {
      restoreWorkspace = 0;
    }
    Me.log(M, 'checkRestore | restoreWorkspace.1: ' + restoreWorkspace);

    if (
      restoreWorkspace != null &&
      restoreWorkspace < workspaceManager.get_n_workspaces() &&
      restoreWorkspace != metaWindow.get_workspace().index()
      ) {
      Me.log(M, 'checkRestore | restoreWorkspace.2: ' + restoreWorkspace);
      this.moveWindow(metaWindow, restoreWorkspace, workspaceManager);
    }
  }

  // A delay is needed to avoid crashes when animations are run in the shell
  runDelayed(act, type) {
    GLib.timeout_add(GLib.PRIORITY_LOW, this._delay + 200, () => {
      type ? this.checkMaximize(act) : this.checkRestore(act);
      this._isMapping = null;
      return GLib.SOURCE_REMOVE;
    });
  }
  
  // Check window workspace history
  checkHistory(metaWindow) {
    Me.log(M, 'checkHistory | window' + metaWindow.title);
    if (!Object.keys(this._history).length) {
      return null;
    }
    Me.log(M, 'checkHistory | h: ' + JSON.stringify(this._history));
    let id = metaWindow.get_id();
    let index = this._history[id];
    if (index != undefined) {
      Me.log(M, 'checkHistory | h.delete: ' + id);
      delete this._history[id];
      return index;
    }
    return null;
  }

  // Clear all workspace history
  clearHistory() {
    Me.log(M, 'clearHistory | history: ' + JSON.stringify(this._history));
    if (Object.keys(this._history).length) {
      Object.keys(this._history).forEach(key => delete this._history[key]);
    }
    this._history = {};
  }

  // If setting is enabled, check focused window when switching workspace
  handleWorkspaceSwitch(enable) {
    Me.log(M, 'handleWorkspaceSwitch | enable: ' + enable);
    if (enable) {
      // handle signal 'switch-workspace'
      this._handleWorkspaceSwitch = global.window_manager.connect('switch-workspace', () => {
        const acts = global.get_window_actors()
          .filter(a => a.meta_window.has_focus());
        Me.log(M, 'handleWorkspaceSwitch | w.length: ' + acts.length);
        if (acts.length) {
          this._noActivate = true;
          Me.log(M, 'handleWorkspaceSwitch | w1: ' + 
            acts[0].meta_window.title + ' noActivate: ' + this._noActivate);
          this.checkMaximize(acts[0]);
          this._noActivate = false;
          Me.log(M, 'handleWorkspaceSwitch | w2: ' + 
            acts[0].meta_window.title + ' noActivate: ' + this._noActivate);
        }
      });
    } else {
      if (this._handleWorkspaceSwitch) {
        // DIsconnect signal
        global.window_manager.disconnect(this._handleWorkspaceSwitch);
        this._handleWorkspaceSwitch = null;
      }
    }
  }

  // Check is window is valid and if there is another one being mapped
  checkWindow(act) {
    if (
      !act ||
      !act.meta_window ||
      act.meta_window.window_type !== Meta.WindowType.NORMAL
    ) {
      return false;
    }
    if (this._isMapping && (this._isMapping === act.meta_window.get_id())) {
      return false;
    }
    this._isMapping = act.meta_window.get_id();
    Me.log(M, 'checkWindow | window: ' + act.meta_window.title +
        ' isMapping: ' + this._isMapping);
    return true;
  }

  // Start manager
  start() {
    Me.log(M, 'starting');
    this._isStarting = true;
    
    // when started, check all current windows
    global.get_window_actors().forEach(actor => this.checkMaximize(actor));

    // handle signal 'map' (new windows)
    this._handles.push(global.window_manager.connect('map', (_, act) => {
      Me.log(M, 'map | w.title: ' + act.meta_window.title +
        ' isMapping: ' + this._isMapping);
      
      if (this.checkWindow(act)) this.runDelayed(act, 1);

    }));

    // handle signal 'size-change'
    this._handles.push(global.window_manager.connect('size-change', (_, act, change) => {
      Me.log(M, 'size-change | w.title: ' + act.meta_window.title +
        ' isMapping: ' + this._isMapping);
      
      if (this.checkWindow(act)) {
        if (change === Meta.SizeChange.MAXIMIZE) {
          this.runDelayed(act, 1);
        } else if (change === Meta.SizeChange.UNMAXIMIZE) {
          this.runDelayed(act, 0);
        }
      }

    }));

    this._isStarting = false;
    Me.log(M, 'started');
  }

  // Destroy manager
  destroy() {
    Me.log(M, 'destroying');

    // disconnect from signals
    this._handles.splice(0).forEach((key) => {
          global.window_manager.disconnect(key);
    });
    this._handles = [];

    this._windowTracker.destroy();
    this.handleWorkspaceSwitch(false);
    this.clearHistory();

    Me.log(M, 'destroyed');
  }
}