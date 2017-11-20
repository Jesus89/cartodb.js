var _ = require('underscore');
var Backbone = require('backbone');
var CartoError = require('./error');
var Engine = require('../../engine');
var Events = require('./events');
var LayerBase = require('./layer/base');
var Layers = require('./layers');
var Leaflet = require('./leaflet');
var VERSION = require('../../../package.json').version;

/**
 * This is the entry point for a Carto.js application.
 *
 * A CARTO client allows managing layers and dataviews. It also takes care
 * of the communication between a Carto.js application and the services in CARTO.
 * To create a new client you need a CARTO account, where you will be able to get
 * your API key and username.
 *
 * @param {object} settings
 * @param {string} settings.apiKey - API key used to authenticate against CARTO
 * @param {string} settings.username - Name of the user
 * @param {string} [settings.serverUrl] - URL of the windshaft server
 *
 * @example
 *
 * var client = new carto.Client({
 *   apiKey: 'YOUR_API_KEY_HERE',
 *   username: 'YOUR_USERNAME_HERE'
 * });
 * 
 * @constructor
 * @memberof carto
 * @api
 *
 * @fires CartoError
 * @fires carto.events.SUCCESS
 */
function Client (settings) {
  _checkSettings(settings);
  this._layers = new Layers();
  this._dataviews = [];
  this._engine = new Engine({
    apiKey: settings.apiKey,
    username: settings.username,
    serverUrl: settings.serverUrl || 'https://{user}.carto.com'.replace(/{user}/, settings.username),
    statTag: 'carto.js-v' + VERSION
  });
  this._bindEngine(this._engine);
}

_.extend(Client.prototype, Backbone.Events);

/**
 * Add a layer to the client.
 *
 * @param {carto.layer.Base} - The layer to be added
 * @param {object} opts
 * @param {boolean} opts.reload - Default: true. A boolean flag controlling if the client should be reloaded
 * 
 * @fires CartoError
 * @fires carto.events.SUCCESS
 *
 * @returns {Promise} - A promise that will be fulfilled when the reload cycle is completed
 * @api
 */
Client.prototype.addLayer = function (layer, opts) {
  return this.addLayers([layer], opts);
};

/**
 * Add multiple layers to the client.
 *
 * @param {carto.layer.Base[]} - An array with the layers to be added
 * @param {object} opts
 * @param {boolean} opts.reload - Default: true. A boolean flag controlling if the client should be reloaded
 *
 * @fires CartoError
 * @fires carto.events.SUCCESS
 *
 * @returns {Promise} A promise that will be fulfilled when the reload cycle is completed
 * @api
 */
Client.prototype.addLayers = function (layers, opts) {
  opts = opts || {};
  layers.forEach(this._addLayer, this);
  if (opts.reload === false) {
    return Promise.resolve();
  }
  return this._reload();
};

/**
 * Remove a layer from the client
 *
 * @param {carto.layer.Base} - The layer to be removed
 * @param {object} opts
 * @param {boolean} opts.reload - Default: true. A boolean flag controlling if the client should be reloaded
 * 
 * @fires CartoError
 * @fires carto.events.SUCCESS
 *
 * @returns {Promise} A promise that will be fulfilled when the reload cycle is completed
 * @api
 */
Client.prototype.removeLayer = function (layer, opts) {
  return this.removeLayers([layer], opts);
};

/**
 * Remove multiple layer from the client
 *
 * @param {carto.layer.Base[]} - An array with the layers to be removed
 * @param {object} opts
 * @param {boolean} opts.reload - Default: true. A boolean flag controlling if the client should be reloaded
 * 
 * @fires CartoError
 * @fires carto.events.SUCCESS
 *
 * @returns {Promise} A promise that will be fulfilled when the reload cycle is completed
 * @api
 */
Client.prototype.removeLayers = function (layers, opts) {
  opts = opts || {};
  layers.forEach(this._removeLayer, this);
  if (opts.reload === false) {
    return Promise.resolve();
  }
  return this._reload();
};

/**
 * Get all the layers from the client
 *
 * @returns {carto.layer.Base[]} An array with all the Layers from the client
 * @api
 */
Client.prototype.getLayers = function () {
  return this._layers.toArray();
};

/**
 * Add a dataview to the client.
 *
 * @param {carto.dataview.Base} - The dataview to be added
 * @param {boolean} opts.reload - Default: true. A boolean flag controlling if the client should be reloaded
 *
 * @fires CartoError
 * @fires carto.events.SUCCESS
 * 
 * @returns {Promise} - A promise that will be fulfilled when the reload cycle is completed
 * @api
 */
Client.prototype.addDataview = function (dataview, opts) {
  return this.addDataviews([dataview], opts);
};

/**
 * Add multipe dataviews to the client.
 *
 * @param {carto.dataview.Base[]} - An array with the dataviews to be added
 * @param {object} opts
 * @param {boolean} opts.reload - Default: true. A boolean flag controlling if the client should be reloaded
 *
 * @fires CartoError
 * @fires carto.events.SUCCESS
 * 
 * @returns {Promise} A promise that will be fulfilled when the reload cycle is completed
 * @api
 */
Client.prototype.addDataviews = function (dataviews, opts) {
  opts = opts || {};
  dataviews.forEach(this._addDataview, this);
  if (opts.reload === false) {
    return Promise.resolve();
  }
  return this._reload();
};

/**
 * Remove a dataview from the client.
 *
 * @param {carto.dataview.Base} - The dataview array to be removed
 * @param {object} opts
 * @param {boolean} opts.reload - Default: true. A boolean flag controlling if the client should be reloaded
 *
 * @fires CartoError
 * @fires carto.events.SUCCESS
 * 
 * @returns {Promise} A promise that will be fulfilled when the reload cycle is completed
 * @api
 */
Client.prototype.removeDataview = function (dataview, opts) {
  opts = opts || {};
  this._dataviews.splice(this._dataviews.indexOf(dataview));
  this._engine.removeDataview(dataview.$getInternalModel());
  if (opts.reload === false) {
    return Promise.resolve();
  }
  return this._reload();
};

/**
 * Get all the dataviews from the client
 *
 * @returns {carto.dataview.Base[]} An array with all the dataviews from the client
 * @api
 */
Client.prototype.getDataviews = function () {
  return this._dataviews;
};

/**
 * Return a Leaflet layer that groups all the layers that have been
 * added to this client.
 * 
 * @api
 */
Client.prototype.getLeafletLayer = function () {
  this._leafletLayer = this._leafletLayer || new Leaflet.LayerGroup(this._layers, this._engine);
  return this._leafletLayer;
};

/**
 * Call engine.reload wrapping the native cartojs errors
 * into public CartoErrors.
 */
Client.prototype._reload = function () {
  return this._engine.reload()
    .then(function () {
      return Promise.resolve();
    })
    .catch(function (error) {
      return Promise.reject(new CartoError(error));
    });
};

/**
 * Helper used to link a layer and an engine.
 * @private
 */
Client.prototype._addLayer = function (layer, engine) {
  _checkLayer(layer);
  this._layers.add(layer);
  layer.$setEngine(this._engine);
  this._engine.addLayer(layer.$getInternalModel());
};

/**
 * Helper used to remove a layer from the client.
 */
Client.prototype._removeLayer = function (layer) {
  _checkLayer(layer);
  this._layers.remove(layer);
  this._engine.removeLayer(layer.$getInternalModel());
};

/**
 * Helper used to link a dataview and an engine
 * @private
 */
Client.prototype._addDataview = function (dataview, engine) {
  this._dataviews.push(dataview);
  dataview.$setEngine(this._engine);
  this._engine.addDataview(dataview.$getInternalModel());
};

/**
 * Client exposes Event.SUCCESS and RELOAD_ERROR to the api users, 
 * those events are wrappers using _engine internaly. 
 */
Client.prototype._bindEngine = function (engine) {
  engine.on(Engine.Events.RELOAD_SUCCESS, function () {
    this.trigger(Events.SUCCESS);
  }.bind(this));

  engine.on(Engine.Events.RELOAD_ERROR, function (err) {
    this.trigger(Events.ERROR, new CartoError(err));
  }.bind(this));
};

/**
 * Utility function to reduce duplicated code.
 * Check if an object inherits from LayerBase.
 */
function _checkLayer (object) {
  if (!(object instanceof LayerBase)) {
    throw new TypeError('The given object is not a layer');
  }
}

function _checkSettings (settings) {
  _checkApiKey(settings.apiKey);
  _checkUsername(settings.username);
  if (settings.serverUrl) {
    _checkServerUrl(settings.serverUrl, settings.username);
  }
}

function _checkApiKey (apiKey) {
  if (!apiKey) {
    throw new TypeError('apiKey property is required.');
  }
  if (!_.isString(apiKey)) {
    throw new TypeError('apiKey property must be a string.');
  }
}

function _checkUsername (username) {
  if (!username) {
    throw new TypeError('username property is required.');
  }
  if (!_.isString(username)) {
    throw new TypeError('username property must be a string.');
  }
}

function _checkServerUrl (serverUrl, username) {
  var urlregex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/;
  if (!serverUrl.match(urlregex)) {
    throw new TypeError('serverUrl is not a valid URL.');
  }
  if (serverUrl.indexOf(username) < 0) {
    throw new TypeError('serverUrl doesn\'t match the username.');
  }
}

module.exports = Client;