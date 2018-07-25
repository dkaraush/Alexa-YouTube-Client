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
		server_url: "localhost:8034",
		youtube_api_key: null,
		youtubedlpath: (/^win/.test(process.platform) ? 'youtube-dl.exe' : 'youtube-dl'),
		controlpage_url: "admin",
		login: "admin",
		password: randomString(16)
	}, true);
	if (config.server_url[config.server_url.length-1] == "/")
		config.server_url = config.server_url.substring(0, config.server_url.length-1);
	controlpage = require('./controlpage/index.js');
	controlpage.url = config.controlpage_url || randomString(16);
	var youtube = require('./scripts/youtube.js')(config.youtube_api_key);
	var lambda = await require('./scripts/skill.js')(youtube);

	global.playerData = loadJSONFile("playerData.json", {}, false);
	global.videosData = loadJSONFile("videosData.json", {}, false);

	var skill = null;

	function requestHandler(req, res) {
		var url = getURL(req);
		var query = getQuery(req);
		if (url.split('/').length >= 2 && url.split('/')[1] == controlpage.url) {
			var auth = req.headers['authorization'];
			if (!auth) {
				res.statusCode = 401;
				res.setHeader('WWW-Authenticate', 'Basic realm="Secure Area"');
				res.end();
				return;
			}
			var base64 = auth.split(' ')[1];
			var buff = new Buffer(base64, 'base64');
			var plainauth = buff.toString();

			var login = plainauth.split(':')[0];
			var password = plainauth.split(':')[1];

			if (config.login != login || config.password != password) {
				res.statusCode = 401;
				res.setHeader('WWW-Authenticate', 'Basic realm="Secure Area"');
				res.end();
				return;
			}

			controlpage.receive(req, res, url, query);
			return;
		}
		if (url == "/videos") {
			var from = query.from;
			if (!from) {
				respond(res, 404, "text/html", "'from' parameter in query string is missing");
				return;
			}
			if (!/^https:\/\/(.+)\.googlevideo\.com/.test(from)) {
				respond(res, 404, "text/html", "we support only 'googlevideo.com' domain");
				return;
			}
			var hostname = from.replace(/(\/videoplayback.+$|https:\/\/)/g,'');
			var path = decodeURIComponent(from.replace(/^https:\/\/.+\.googlevideo\.com/g, ''));
			console.log({
				hostname,
				path,
				method: req.method,
				headers: {
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/67.0.3396.99 Safari/537.36',
					'DNT': 1
				}
			})
			https.get({
				hostname,
				path,
				method: req.method,
				headers: {
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/67.0.3396.99 Safari/537.36',
					'DNT': 1
				}
			}, function (response) {
				for (var header in response.headers) {
					if (header == 'date') continue;
					res.setHeader(header, response.headers[header]);
				}
				response.pipe(res);
				response.on('err', () => {
					res.statusCode = 404;
					res.end();
				});
			}).on('err', () => {
				res.statusCode = 404;
				res.end();
			})
			return;
		}

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
			controlpage.startReportingRequest(reqId, userId, json, req);
			var headers = req.headers;
			verifier(headers.signaturecertchainurl, headers.signature, data, (err) => {
				if (err) {
					respond(res, 400, "application/json", {status: 'failure', reason: err});
					error(reqId, 'Bad signature request.', req.connection.remoteAddress, err);
					controlpage.stopReportingRequest(reqId, userId, res, {status: 'failure', reason: err});
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
						controlpage.stopReportingRequest(reqId, userId, res, response);
					})
					.catch(err => {
						respond(res, 500, "application/json", {status: 'failure', reason: err});
						controlpage.stopReportingRequest(reqId, userId, res, {status: 'failure', reason: err});
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
		console.log("Control page is available at " + ("/"+controlpage.url).magenta);
		console.log("Login".cyan + ": " + config.login)
		console.log("Password".cyan + ": " + config.password)
	});
}

start();

global.exitHandler = function(options, err, code) {
	if (typeof err !== "undefined" && err != null) {
    	console.log ((err.stack || err.message || err.getMessage || err.toString()).red);
		controlpage.reportError(err);
    }
    if (options.exit) {
    	console.log("Saving...")
		saveJSONFile("playerData.json", playerData);
		controlpage.save();
		console.log("Saved.".green.bold);
		process.exit(code ? code : 0);
	}
}
process.stdin.on('data', exitHandler.bind(null, {exit: true}))

process.on('SIGINT', exitHandler.bind(null, {exit:true}));
process.on('SIGTERM', exitHandler.bind(null, {exit:true}));
process.on('SIGUSR1', exitHandler.bind(null, {exit:true}));
process.on('SIGUSR2', exitHandler.bind(null, {exit:true}));
process.on('uncaughtException', exitHandler.bind(null, {exit:false}));
process.on('unhandledRejection', exitHandler.bind(null, {exit: false}));