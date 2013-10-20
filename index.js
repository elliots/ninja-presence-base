var util = require('util'),
  stream = require('stream'),
  _ = require('underscore');

util.inherits(Driver,stream);

function Driver(opts,app) {

  var self = this;

  this.writeable = false;
  this.readable = true;

  this._opts = opts;
  this._app = app;

  opts.timeout = opts.timeout || 1000 * 60 ;
  opts.scanDelay = opts.scanDelay || 10000;
  
  this._opts.logging = this._opts.logging || true; //Logging is on by default

  this._timeouts = {};
  opts.lastValue = opts.LastValue || {};
  
  //All the devices discovered will be saved here, so we can emit the correct state.
  this._allDevices = {};
  
  //State device
  function PresenceStateDevice() {
  	this.readable = true;
  	this.writeable = true;
  	this.V = 0;
  	this.D = 244; //Generic state device
  	this.G = "presence";
  	var device = this;
  	
  	this._states = ['NobodyHome','SomeoneHome','EveryoneHome'];
  	
  }  
  util.inherits(PresenceStateDevice,stream);
  
  PresenceStateDevice.prototype.actuateState = function(newState) {
  	if(!this._state || this._state != newState){
  		self.writeToLog('Presence => State changed from '+ this._state + ' to '+newState);
  		this._state = newState;
  		this.emit('data',newState);
  	}
  };
  
  PresenceStateDevice.prototype.write = function(data) {
  	if(this._states.contains(data))
  	{
  		this.actuateState(data);
  		return true;
  	} else {
  		return false;
  	}
  }
  
  //Used an array, in case more sub devices need to be added.
  this.subDevices = {
  	presenceState : new PresenceStateDevice()
  };
  
  

  app.on('client::up',function(){
    if (!self.G) {
      throw new Error('You must set "G" when creating a presence driver.');
    }
    if (self.V === undefined) {
      throw new Error('You must set "V" when creating a presence driver.');
    }
    if (self.D == undefined) {
      throw new Error('You must set "D" when creating a presence driver.');
    }
    //Register current device
    self.emit('register', self);
    //Register subdevice
    Object.keys(self.subDevices).forEach(function(id) {
		self._app.log.info('Adding sub-device', id, self.subDevices[id].G);
		self.emit('register', self.subDevices[id]);
	});
    
    if (self.save) {
      self.save(); // May not be there in the test harness
    }
    if (self.init) {
      self.init();
    }
    if (self.scan) {
      self.startScanning();
    }
    
    
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
  
  if(!self._allDevices[entity.id]) {
  	self._allDevices[entity.id] = true;
  }

  if (!_.isEqual(this._opts.lastValue[entity.id], entity)) {
    self.emit('data', entity);
    this._opts.lastValue[entity.id] = entity;
  }

  self._timeouts[entity.id] = setTimeout(function() {
      entity.present = entity['new'] = false;
      self.emit('data', entity);
      delete(self._timeouts[entity.id]);
      self.sendPresenceState(); //after removing the entity from the timeout the state should change.
  }, this._opts.timeout);
  
  //We have seen a device, so the state could be updated.
  self.sendPresenceState();
};

Driver.prototype.sendPresenceState = function(){
	var self = this;
	
	//Get the number of objects in the timeout list.
  	//Device get added and removed by the ninja-presence-base driver
  	var currentOnlineHosts = Object.keys(self._timeouts).length;
  	self.writeToLog('Presence => Number devices online: ' + currentOnlineHosts);
  	self.writeToLog('Presence => All devices',self._allDevices);
  	
  	if(currentOnlineHosts == 0) // 0 devices in the timeout list = Nobody home
	{
		self.subDevices.presenceState.actuateState(self.subDevices.presenceState._states[0]);
	} else if( currentOnlineHosts == Object.keys(self._allDevices).length) // All devices ever seen are online
	{
		self.subDevices.presenceState.actuateState(self.subDevices.presenceState._states[2]);
	} else  //There are less devices in the timeout array then devices ever seen
	{
		self.subDevices.presenceState.actuateState(self.subDevices.presenceState._states[1]);
	}
}

Driver.prototype.writeToLog = function(s) {
	if(this._opts.logging) {
		this._app.log.info(arguments);
	}

}

module.exports = Driver;
