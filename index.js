var util = require('util'),
  stream = require('stream'),
  _ = require('underscore');

util.inherits(Driver,stream);

function Driver(opts,app) {

  var self = this;

  this.writeable = false;
  this.readable = true;
  this.V = 0;
  this.D = 14;

  this._opts = opts;
  this._app = app;

  opts.timeout = opts.timeout || 1000 * 60 ;
  opts.scanDelay = opts.scanDelay || 10000;

  this._timeouts = {};
  opts.lastValue = opts.LastValue || {};

  app.on('client::up',function(){
    if (!self.G) {
      throw 'You must set "G" when creating a presence driver.';
    }
    self.emit('register', self);
    if (self.save) {
      self.save(); // May not be there in the test harness
    }
    if (self.init) {
      self.init();
    }
    self.startScanning();
  });

}

Driver.prototype.startScanning = Driver.prototype.scanComplete = function() {
  var self = this;
  setTimeout(function() {
      self._app.log.debug('Scanning');
      self.scan();
  }, this._opts.scanDelay);
};

// TODO: Stupid name
Driver.prototype.see = function(entity) {
  var self = this;
  entity['new'] = !self._timeouts[entity.id];
  entity.present = true;

  if (self._timeouts[entity.id]) {
    clearTimeout(self._timeouts[entity.id]);
  }

  if (!_.isEqual(this._opts.lastValue[entity.id], entity)) {
    self.emit('data', entity);
    this._opts.lastValue[entity.id] = entity;
  }

  self._timeouts[entity.id] = setTimeout(function() {
      entity.present = entity['new'] = false;
      self.emit('data', entity);
      delete(self._timeouts[entity.id]);
  }, this._opts.timeout);
};

Driver.prototype.scan = function() {
  throw 'The "scan" method needs to be overridden when creating a presence driver';
};


module.exports = Driver;
