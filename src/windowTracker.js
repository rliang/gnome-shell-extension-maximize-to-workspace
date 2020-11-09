'use strict';
/* Gnome libs imports */
const ExtensionUtils = imports.misc.extensionUtils;
/* Extension imports */
const Me = ExtensionUtils.getCurrentExtension();
const Prefs = Me.imports.prefs;
/* Constants */
const M = 'WindowTracker';
/* exported WindowManager */
var WindowTracker = class WindowTRacker {
  constructor(windowManager) {
    Me.log(M, 'init');
    this._wm = windowManager;
    this._trackedWindows = [];
  }

  // add window to be tracked and connect destroy signal
  add(id, window) {
    Me.log(M, 'add | w.id: ' + id);
    const trackedWindow = new Object({
      id: id,
      window: window
    });
    trackedWindow.destroyId = window.connect("destroy", () => {
        this.handleDestroy(trackedWindow);
      });
    this._trackedWindows.push(trackedWindow);
  }

  isTracked(id) {
    return this._trackedWindows.filter((w) => w.id === id).length !== 0;
  }

  // remove window from history, if it exists there, and disconnect/remove 
  handleDestroy(trackedWindow) {
    let id = trackedWindow.id;
    Me.log(M, "handleDestroy | w.id: " + id);
    let index = this._wm._history[id];
    Me.log(M, "handleDestroy | h: " + JSON.stringify(this._wm._history));
    if (index !== undefined) {
      Me.log(M, "handleDestroy | h.delete: " + id);
      delete this._wm._history[id];
    }
    id = trackedWindow.destroyId;
    Me.log(M, "handleDestroy | d.id: " + id);
    if (id !== undefined && trackedWindow.window) {
      try {
        trackedWindow.window.disconnect(id);
      } catch {
        Me.logError(M, "handleDestroy id: " + id);
      }
      index = this._trackedWindows.indexOf(trackedWindow);
      Me.log(M, "handleDestroy | index: " + index);
      this._trackedWindows.splice(index, 1);
    }
    Me.log(M, "handleDestroy | tw.length: " + this._trackedWindows.length);
  }

  destroy() {
    Me.log(M, 'destroy');
    if (this._trackedWindows.length) {
      try {
        this._trackedWindows.splice(0).forEach((tw) => {
          if (tw.destroyId) {
            tw.window.disconnect(tw.destroyId);
          }
        });
      } catch {
        Me.logError(M, "destroy id: " + tw.destroyId);
      }
    }
    Me.log(M, "destroy | tw.length: " + this._trackedWindows.length);
    this._trackedWindows = [];
  }
};
