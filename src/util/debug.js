"use strict";
/* Extension imports */
const Me = imports.misc.extensionUtils.getCurrentExtension();
/* Constants*/
const EXTNAME = "M2W";
/* Exported function */
var init = function (enable) {
  
  if (enable) {
    
    Me.log = function (module, msg) {
      log(`[${EXTNAME}-${module}] ${msg}`);
    };
    
    Me.logError = function (module, msg) {
      log(`[${EXTNAME}-${module}] ERROR: ${msg}`);
    };
      
    Me.log("DEBUG_ON", Me.metadata.name);

  } else {

    Me.log = function () {};

    Me.logError = function () {};

    log(`[${EXTNAME}-DEBUG_OFF] ${Me.metadata.name}`);

  }
};
