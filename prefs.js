'use strict';
const { Gio, Gtk } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

var SETTINGS_CHECK_SWITCH = 'check-switch';
var SETTINGS_EXPAND = 'expand';
var SETTINGS_SINGLE_MONITOR = 'single-monitor';
var SETTINGS_RESTORE = 'restore';
var SETTINGS_RESTORE_HISTORY = 'restore-history';
var SETTINGS_RESTORE_MODE = 'restore-mode';
var SETTINGS_RESTORE_TO_FIRST = 'restore-to-first';

var Settings = class MaximizeToWorkspace_Settings {
  constructor() {
    this._settings = ExtensionUtils.getSettings();

    this._builder = new Gtk.Builder();
    this._builder.add_from_file(Me.path + '/Settings.ui');

    this.widget = new Gtk.ScrolledWindow({ hscrollbar_policy: Gtk.PolicyType.NEVER });
    this._notebook = this._builder.get_object('settings_notebook');
    this.widget.add(this._notebook);

    this.widget.connect('realize', () => {
      const window = this.widget.get_toplevel();
      const [default_width, default_height] = window.get_default_size();
      window.resize(default_width, 480);
    });

    this._bindSettings();

    this._builder.connect_signals_full(this._connector.bind(this));
  }

  _connector(builder, object, signal, handler) {
    const SignalHandler = {
      restore_to_first_radio_button_toggled_cb(button) {
        if (button.get_active())
          this._settings.set_enum(SETTINGS_RESTORE_MODE, 0);
      },

      restore_history_radio_button_toggled_cb(button) {
        if (button.get_active())
          this._settings.set_enum(SETTINGS_RESTORE_MODE, 1);
      }
    }

    object.connect(signal, SignalHandler[handler].bind(this));
  }

  _bindSettings() {
    this._settings.bind(SETTINGS_SINGLE_MONITOR,
      this._builder.get_object('single_monitor_switch'),
      'active',
      Gio.SettingsBindFlags.DEFAULT);
    this._settings.bind(SETTINGS_EXPAND,
      this._builder.get_object('expand_switch'),
      'active',
      Gio.SettingsBindFlags.DEFAULT);
    this._settings.bind(SETTINGS_RESTORE,
      this._builder.get_object('restore_switch'),
      'active',
      Gio.SettingsBindFlags.DEFAULT);
    this._settings.bind(SETTINGS_CHECK_SWITCH,
      this._builder.get_object('check_workspace_switch'),
      'active',
      Gio.SettingsBindFlags.DEFAULT);
              
    this._settings.bind(SETTINGS_RESTORE,
      this._builder.get_object('restore_mode_box'),
      'sensitive',
      Gio.SettingsBindFlags.GET);
    let expandModeRadioButtons = [
      this._builder.get_object('restore_to_first_radio_button'),
      this._builder.get_object('restore_history_radio_button'),
    ];
    expandModeRadioButtons[
      this._settings.get_enum(SETTINGS_RESTORE_MODE)
    ].set_active(true);
  }
};

function init() {
}

function buildPrefsWidget() {
  const settings = new Settings();
  settings.widget.show_all();
  return settings.widget;
}