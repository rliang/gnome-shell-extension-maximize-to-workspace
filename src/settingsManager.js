'use strict';
/* Gnome libs imports */
const { GLib, Meta, St } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;
/* Extension imports */
const Me = ExtensionUtils.getCurrentExtension();
const Prefs = Me.imports.prefs;
/* Constants */
const M = 'SettingsManager';
/* exported SettingsManager */
var SettingsManager = class SettingsManager {
  constructor(windowManager) {
    Me.log(M, 'init');

    this._wm = windowManager;

    this._handles = [];                       // Signal handles
    this._lastCheckWorkspace = undefined;     // Internal variables to check state
    this._lastExpand = undefined;
    this._lastHistory = undefined;
    this._lastRestore = undefined;

    // load settings and connect system signals
    this._mutterSettings = ExtensionUtils.getSettings('org.gnome.mutter');
    this._interfaceSettings = ExtensionUtils.getSettings('org.gnome.desktop.interface');
    this._settings = ExtensionUtils.getSettings();

    this._handles.push(this._mutterSettings.connect('changed', () => this.updateSystemSettings()));
    this._handles.push(this._interfaceSettings.connect('changed', () => this.updateSystemSettings()));
    this.updateSystemSettings();
    
    // load settings and connect signal
    this._handles.push(this._settings.connect('changed', () => this.updateSettings()));
    this.updateSettings();

  }

  // update variables from settings
  updateSettings() {
    Me.log(M, 'updateSettings | lastRestore: ' + this._lastRestore +
      '  lastHistory: ' + this._lastHistory +
      '  lastExpand: ' + this._lastExpand);

    this._wm._isSingleMonitor = this._settings.get_boolean(Prefs.SETTINGS_SINGLE_MONITOR);
    this._wm._isRestore = this._settings.get_boolean(Prefs.SETTINGS_RESTORE);
    this._wm._isFixedExpand = this._settings.get_boolean(Prefs.SETTINGS_EXPAND);
    this._checkWorkspaceSwitch = this._settings.get_boolean(Prefs.SETTINGS_CHECK_SWITCH);
    this._wm._useRestoreHistory = this._settings.get_enum(Prefs.SETTINGS_RESTORE_MODE);

    if (this._wm._isFixedExpand !== this._lastExpand) {
      this._wm._expandWorkspace = null;
      this._lastExpand = this._wm._isFixedExpand;
    }
    
    if (this._checkWorkspaceSwitch !== this._lastCheckWorkspace) {
      this._wm.handleWorkspaceSwitch(this._checkWorkspaceSwitch);
      this._lastCheckWorkspace = this._checkWorkspaceSwitch;
    }

    if (
      this._wm._useRestoreHistory != this._lastHistory ||
      this._wm._isRestore !== this._lastRestore
    ) {
      this._wm.clearHistory();
      this._lastRestore = this._wm._isRestore;
      this._lastHistory = this._wm._useRestoreHistory;
    }

    Me.log(M, 'updateSettings | restore: ' + this._wm._isRestore +
    ' restoreHist: ' + this._wm._useRestoreHistory +
    ' expand: ' + this._wm._isFixedExpand +
    ' singleMonitor: ' + this._wm._isSingleMonitor +
    ' h.length: ' + Object.keys(this._wm._history).length);
    
  }

  // update variables from system settings
  updateSystemSettings() {
    this._wm._isDynamic = this._mutterSettings.get_boolean('dynamic-workspaces');
    const isAnimations = this._interfaceSettings.get_boolean('enable-animations');
    const animationFactor = St.Settings.get().slow_down_factor;

    this._wm._delay = Math.round((isAnimations ? 1 : 0) * animationFactor * 300) + 100;
    Me.log(M, 'updateSettings | delay: ' + this._wm._delay);

    Me.log(M, 'updateSettings | GS.animations: ' +
      isAnimations + ' | St.animations: ' +
      St.Settings.get().enable_animations + ' | animation.factor: ' +
      animationFactor);
  }

  destroy() {
    Me.log(M, 'destroy');
    // disconnect from all signals
    this._handles.splice(0).forEach((key, i) => {
        switch (i) {
          case 0:
            this._mutterSettings.disconnect(key);
            this._mutterSettings = null;
            break;
          case 1:
            this._interfaceSettings.disconnect(key);
            this._interfaceSettings = null;
            break;
          case 2:
            this._settings.disconnect(key);
            this._settings = null;
          }
      });
      this._handles = [];
  }

};
