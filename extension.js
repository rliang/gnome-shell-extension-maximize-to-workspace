'use strict';
/* Gnome libs imports */
const ExtensionUtils = imports.misc.extensionUtils;
/* Extension imports */
const Me = ExtensionUtils.getCurrentExtension();
const { WindowManager } = Me.imports.src.windowManager;
const { SettingsManager } = Me.imports.src.settingsManager;
/* Constants*/
const M = 'Main';                             // Module name
const DEBUG = true;                           // Enable/disable debug
/* Global variables*/
let managers, windowManager;

function init() {
  managers = [];
  Me.imports.src.util.debug.init(DEBUG);
  Me.log(M, 'init');
}

function enable() {
  Me.log(M, 'enabled');
  windowManager = new WindowManager();
  managers.push(windowManager);
  managers.push(new SettingsManager(windowManager));
  windowManager.start();
}

function disable() {
  managers.splice(0).forEach((m) => {
    m.destroy();
  });
  managers = [];
  windowManager = null;

  Me.log(M, 'disabled');
}
