'use strict';

require('colors');
var fs = require('fs');
var http = require('http');
var https = require('https');
var Alexa = require("ask-sdk");
var verifier = require('alexa-verifier');

var controlpage;

async function start() {
	require('./scripts/utils.js');
	global.config = loadJSONFile("config.json", {
		port: 8034,
		youtube_access_token: null,
		youtubedl: (/^win/.test(process.platform) ? 'youtube-dl.exe' : 'youtube-dl')
	}, true);
	controlpage = require('./controlpage/index.js');
	var youtube = require('./scripts/youtube.js')(config.youtube_api_key);
	var lambda = await require('./scripts/skill.js')(youtube);

	global.playerData = loadJSONFile("playerData.json", {}, false);

	var skill = null;

	function requestHandler(req, res) {
		var url = getURL(req);
		if (url != "/alexa/" || req.method != "POST") {
			respond(res, 404, "text/html", "<p>We serve only <pre>/alexa/</pre> with POST method</p>");
			return;
		}

		var data = "";
		req.on('data', chunk => data += chunk);
		req.on('end', function () {
			var json = JSON.parse(data);
			var reqId = json.request.requestId;
			var userId = json.context.System.user.userId;
			controlpage.startReportingRequest(reqId, userId, json, req, res);
			var headers = req.headers;
			verifier(headers.signaturecertchainurl, headers.signature, data, (err) => {
				if (err) {
					respond(res, 400, "application/json", {status: 'failure', reason: err});
					controlpage.report('Bad signature request.', req.connection.remoteAddress, err);
					return;
				}

				if (!skill) {
					skill = Alexa.SkillBuilders.custom()
						.addRequestHandlers(...lambda.requestHandlers)
						.addErrorHandlers(lambda.errorHandler)
						.create();
				}

				skill.invoke(json)
					.then(response => {
						respond(res, 200, "application/json", response);
						controlpage.stopReportingRequest(reqId);
					})
					.catch(err => {
						respond(res, 500, "application/json", {status: 'failure', reason: err});
						controlpage.stopReportingRequest(reqId);
					})

			})
		})

	}

	var server;
	if (config.credentials) {
		var credentials = {
			key: fs.readFileSync(config.credentials.key),
			cert: fs.readFileSync(config.credentials.cert)
		};
		server = https.createServer(credentials, requestHandler);
	} else {
		server = http.createServer(requestHandler);
	}
	server.listen(config.port, function (err) {
		if (err) {
			console.log("Server listen error");
			throw err;
		}
		console.log("Server listens on :" + config.port.toString().magenta);
	});
}

start();

global.exitHandler = function(options, err, code) {
    if (options.exit) {
		console.log("Saving...");
		saveJSONFile("player-data.json", playerData);
		controlpage.save();
		console.log("Saved.".green.bold);
	}
	if (typeof err !== "undefined") {
    	console.log (err.stack.red);
		controlpage.report("Uncaught exception", null, err);
    }
    if (options.exit)
		process.exit(code ? code : 0);
}

process.on('exit', exitHandler.bind(null,{cleanup:true}));
process.on('SIGINT', exitHandler.bind(null, {exit:true}));
process.on('SIGUSR1', exitHandler.bind(null, {exit:true}));
process.on('SIGUSR2', exitHandler.bind(null, {exit:true}));
process.on('uncaughtException', exitHandler.bind(null, {exit:false}));
process.on('unhandledRejection', exitHandler.bind(null, {exit: false}));