'use strict';

require('colors');
var fs = require('fs');
var http = require('http');
var https = require('https');
var Alexa = require("ask-sdk");
var verifier = require('alexa-verifier');

require('./scripts/utils.js');
var config = loadJSONFile("config.json", {
	port: 8034,
	youtube_access_token: null,
	youtubedl: (/^win/.test(process.platform) ? 'youtube-dl.exe' : 'youtube-dl')
}, true);
var youtube = require('./scripts/youtube-client.js')(config.youtube_access_token);
var lambda = require('./scripts/skill.js')(youtube);
var controlpage = require('./controlpage/index.js');

global.playerData = loadJSONFile("playerData.json", {}, false);

var skill = null;

function requestHandler(req, res) {
	var url = getURL(req);
	var query = getQuery(req);

	var data = "";
	req.on('data', chunk => data += chunk);
	req.on('end', function () {
		var json = JSON.parse(data);
		var userId = json.context.System.user.userId;
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
					if (userId)
						controlpage.reportUser(userId, req, res)
					respond(res, 200, "application/json", response)
				})
				.catch(err => {
					if (userId)
						controlpage.reportUser(userId, req, res, err);
					respond(res, 500, "application/json", {status: 'failure', reason: err});
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

global.exitHandler = function(options, err, code) {
	if (err instanceof Error) {
		stats.reportError(err);
    	console.log (err.toString().red);
    }
    if (options.exit) {
		console.log("Saving...");
		saveJSONFile("player-data.json", playerData);
		controlpage.save();
		console.log("Saved.".green.bold);
		process.exit(code ? code : 0);
	}
}

process.on('exit', exitHandler.bind(null,{cleanup:true}));
process.on('SIGINT', exitHandler.bind(null, {exit:true}));
process.on('SIGUSR1', exitHandler.bind(null, {exit:true}));
process.on('SIGUSR2', exitHandler.bind(null, {exit:true}));
process.on('uncaughtException', exitHandler.bind(null, {exit:false}));
process.on('unhandledRejection', (reason, p) => {
  exitHandler({}, reason);
});