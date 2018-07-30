/// RI = Request ID, UI = User ID

module.exports = {};

var {spawn} = require('child_process');
var UIs = {};
global.events = {};
global.users = loadJSONFile("controlpage/data/users.json", {}, false);
global.errors = loadJSONFile("controlpage/data/errors.json", [], false);

exports.url = randomString(16);
module.exports.startReportingRequest = function (RI, UI, reqData, req) {
	console.log("request".magenta.bold + " " + (reqData.request.type == "IntentRequest" ? reqData.request.intent.name : reqData.request.type).blue + " " + RI.white.bold)
	changeUserData(UI, reqData);
	if (!events[UI]) {
		if (!users[UI].evFilename) {
			users[UI].evFilename = randomString(100) + ".json";
		}
		events[UI] = loadJSONFile("controlpage/data/" + users[UI].evFilename, {}, false);
	}
	var eventObj = {
		type: reqData.request.type == "IntentRequest" ? reqData.request.intent.name : reqData.request.type,
		ip: req.headers['x-forwarded-for'],
		time: Date.now(),
		logs: [],
		req: (req.method + " " + req.url + "\n" + headersString(req.headers) + "\n\n" + JSON.stringify(reqData,null,'\t')),
		beforePlayerData: playerData[UI]
	};
	events[UI][RI] = eventObj;
	UIs[RI] = UI;
}
module.exports.stopReportingRequest = function (RI, UI, res, json) {
	if (!events[UI])
		return;
	console.log("===".magenta.bold)
	events[UI][RI].res = headersString(res._headers) + "\n\n" + JSON.stringify(json,null,'\t');
	events[UI][RI].nowPlayerData = playerData[UI];
}
global.debug = function (RI) {
	if (!events[UIs[RI]])
		return;
	console.log("debug ".magenta + " " + Array.from([].slice.apply(arguments).slice(1), a => typeof a === 'object' ? JSON.stringify(a) : a+"").join(" "));
	events[UIs[RI]][RI].logs.push({
		type: "debug",
		message: Array.from([].slice.apply(arguments).slice(1), processArgument)
	})
}
global.log = function (RI) {
	if (!events[UIs[RI]])
		return;
	console.log("log   ".cyan + " " + Array.from([].slice.apply(arguments).slice(1), a => typeof a === 'object' ? JSON.stringify(a) : a+"").join(" "));
	events[UIs[RI]][RI].logs.push({
		type: "log",
		message: Array.from([].slice.apply(arguments).slice(1), processArgument)
	})
}
global.warn = function (RI) {
	if (!events[UIs[RI]])
		return;
	console.log("warn  ".yellow + " " + Array.from([].slice.apply(arguments).slice(1), a => typeof a === 'object' ? JSON.stringify(a) : a+"").join(" "));
	events[UIs[RI]][RI].logs.push({
		type: "warn",
		message: Array.from([].slice.apply(arguments).slice(1), processArgument)
	})
}
global.error = function (RI) {
	if (!events[UIs[RI]])
		return;
	console.log("err   ".red + " " + Array.from([].slice.apply(arguments).slice(1), a => typeof a === 'object' ? JSON.stringify(a) : a+"").join(" "));
	events[UIs[RI]][RI].logs.push({
		type: "err",
		message: Array.from([].slice.apply(arguments).slice(1), processArgument)
	})
}


function changeUserData(UI, json) {
	users[UI] = {
		lastActivity: Date.now(),
		youtube: {
			linked: !!json.context.System.user.accessToken,
			token: json.context.System.user.accessToken
		},
		hasVideoApp: Object.keys(json.context.System.device.supportedInterfaces).indexOf('VideoApp') >= 0,
		hasDisplay: Object.keys(json.context.System.device.supportedInterfaces).indexOf('Display') >= 0,
		evFilename: (users[UI] && users[UI].evFilename) ? users[UI].evFilename : (randomString(100) + ".json")
	}
}
function processArgument(arg) {
	if (typeof arg === 'number')
		return arg;
	if (typeof arg === 'string')
		return arg;
	if (Array.isArray(arg))
		return JSON.stringify(arg);
	if (arg instanceof Error) {
		var r = {};
		if (arg.message) r.message = arg.message;
		if (arg.code) r.code = arg.code;
		if (arg.name) r.name = arg.name;
		if (arg.stack) r.stack = arg.stack;
		return JSON.stringify(r,null,'\t');
	}
	return JSON.stringify(arg,null,'\t');;
}

module.exports.reportError = function (err) {
	errors.push({
		time: Date.now(),
		stack: err.stack
	});
}
module.exports.save = function () {
	saveJSONFile("controlpage/data/users.json", users);
	saveJSONFile("controlpage/data/errors.json", errors);
	for (var UI in users) {
		if (!users[UI].evFilename || !events[UI])
			continue;
		saveJSONFile("controlpage/data/" + users[UI].evFilename, events[UI]);
	}
}

// === WEB PAGE ===
const body_filename = "body.html";
var rules = {
	"main": "users.html",
	"users": "users.html",
	"user": "user.html",
	"event": "event.html",
	"status": "status.html",
	"errors": "errors.html"
}

const eventsPerPage = 10;
var fields = {
	"STATS_URL": () => config.server_url + "/" + module.exports.url,
	"CURRENT_USER_ID": query => query.id,
	"CURRENT_USER_LAST_TEXT": query => dateDifferenceString(users[query.id].lastActivity, Date.now()),
	"CURRENT_USER_LAST_DATETIME": query => datetimeString(users[query.id].lastActivity),
	"CURRENT_USER_LAST_TIMESTAMP": query => users[query.id].lastActivity,
	"CURRENT_USER_YOUTUBE_CONNECTED": query => "✖✔"[users[query.id].youtube.linked+0],
	"CURRENT_USER_YOUTUBE_TOKEN": query => users[query.id].youtube.token,
	"CURRENT_USER_HAS_DISPLAY": query => "✖✔"[users[query.id].hasDisplay+0],	
	"CURRENT_USER_HAS_VIDEO_APP": query => "✖✔"[users[query.id].hasVideoApp+0],	
	"EVENTS_CURRENT_PAGE": query => {
		if (!events[query.id] && users[query.id].evFilename)
			events[query.id] = loadJSONFile('controlpage/data/'+users[query.id].evFilename, {}, false);
		var eventsCount = Object.keys(events[query.id] || {}).length;
		if (!query.event_page || query.event_page < 0 || query.event_page >= (Math.ceil(eventsCount) / eventsPerPage))
			return Math.ceil(eventsCount / eventsPerPage);
		return parseInt(query.event_page)+1;
	},
	"EVENTS_PAGE_COUNT": query => {
		if (!events[query.id] && users[query.id].evFilename)
			events[query.id] = loadJSONFile('controlpage/data/'+users[query.id].evFilename, {}, false);
		var eventsCount = Object.keys(events[query.id] || {}).length;
		return Math.ceil(eventsCount / eventsPerPage);
	},
	"USERS_COUNT": () => Object.keys(users).length,
	"CONFIG": () => JSON.stringify(config, null, "\t")
}
var templates = {
	"USER_TEMPLATE": {
		array: () => Array.from(Object.keys(users), x => Object.assign(users[x], {id: x})).sort((a,b)=>a.lastActivity>b.lastActivity?-1:(a.lastActivity<b.lastActivity?1:0)),
		ifempty: () => "<div id='empty'>Empty :C</div>",
		"USER_ID": (user) => user.id,
		"USER_LAST": (user) => dateDifferenceString(user.lastActivity, Date.now())
	},
	"EVENT_TEMPLATE": {
		array: query => {
			var arr = [];
			if (!events[query.id] && users[query.id].evFilename) 
				events[query.id] = loadJSONFile('controlpage/data/'+users[query.id].evFilename, {}, false);
			if (events[query.id])
				arr = Array.from(Object.keys(events[query.id]), k => Object.assign(events[query.id][k], {id: k})).sort((a,b)=>a.time>b.time?-1:(a.time<b.time?1:0));
			if (arr.length <= eventsPerPage || !query.event_page)
				return arr;
			var maxPages = Math.ceil(arr.length / eventsPerPage)
			if (!query.event_page || query.event_page < 0 || query.event_page >= maxPages)
				query.event_page = maxPages-1;
			return chunkArray(arr, eventsPerPage).reverse()[query.event_page];
		},
		ifempty: () => "<div id='empty'>Empty :C</div>",
		"EVENT_SHORT": event => event.type,
		"EVENT_TIME_DIFFERENCE": event => dateDifferenceString(event.time, Date.now()),
		"EVENT_INDEX": event => event.id
	},
	"EVENT_INFO_TEMPLATE": {
		array: query => {
			if (!events[query.id] && users[query.id].evFilename)
				events[query.id] = loadJSONFile('controlpage/data/'+users[query.id].evFilename)
			if (!events[query.id] && !users[query.id].evFilename)
				return [];
			if (!events[query.id][query.event])
				return [];
			return [events[query.id][query.event]];
		},
		"EVENT_TIME_DIFFERENCE": event => dateDifferenceString(event.time, Date.now()),
		"EVENT_TIME_FULL": event => datetimeString(event.time),
		"EVENT_REQUEST": event => event.req,
		"EVENT_RESPONSE": event => event.res,
		"EVENT_PLAYERDATA_WAS": event => JSON.stringify(event.beforePlayerData,null,"\t"),
		"EVENT_PLAYERDATA_NOW": event => JSON.stringify(event.nowPlayerData,null,"\t"),
		"EVENT_LOGS": event => {
			return Array.from(event.logs, log => {
				return "<span class='"+log.type+"'>"+log.type+"</span> "+Array.from(log.message, arg => "<span class='arg'>"+arg+"</span>").join(" ");
			}).join("<br>");
		}
	},
	"PLAYER_DATA_TEMPLATE": {
		array: query => playerData[query.id] ? [playerData[query.id]] : [],
		"JSON": data => JSON.stringify(data, null, '\t')
	},
	"ERROR_TEMPLATE": {
		array: () => errors.slice().reverse(),
		ifempty: () => "<div id='empty'>Empty :C</div>",
		"ERROR_JSON": err => err.stack,
		"ERROR_TIME_DIFFERENCE": err => dateDifferenceString(err.time, Date.now()),
		"ERROR_TIME_FULL": err => datetimeString(err.time)
	}
}

module.exports.receive = function (req, res, url, query) {
	// url formatting
	if (url[0] == "/")
		url = url.substring(1);

	if (url.indexOf("/") == -1)
		url = "main";
	else 
		url = url.substring(url.indexOf("/")+1);

	if (url[url.length - 1] == "/")
		url = url.substring(0, url.length-1);

	var dirs = url.split("/");
	if (url == "restart") {
		res.statusCode = 302;
		res.setHeader("Location", config.server_url + "/" + module.exports.url + "/");
		res.end();
		exitHandler({exit: true},null,36);
	} else if (url == "update") {
		res.statusCode = 302;
		res.setHeader("Location", config.server_url + "/" + module.exports.url + "/");
		res.end();
		exitHandler({exit: true},null,37);
	} else if (url == "youtubedlversion") {
		res.statusCode = 200;
		res.setHeader("Content-Type", "text/plain");
		var youtubedl = spawn(config.youtubedlpath || "youtube-dl.exe", ["--version"]);
		youtubedl.stdout.on('data', (data) => {
			res.write(data);
		});
		youtubedl.stderr.on('data', (data) => {
			res.write(data);
		});
		youtubedl.on('close', () => {
			res.end();
		});
		return;
	} else if (url == "youtubedl") {
		res.statusCode = 200;
		res.setHeader("Content-Type", "text/plain");
		var youtubedl = spawn(config.youtubedlpath || "youtube-dl.exe", JSON.parse(query.args));
		youtubedl.stdout.on('data', (data) => {
			res.write(data);
		});
		youtubedl.stderr.on('data', (data) => {
			res.write(data);
		});
		youtubedl.on('close', () => {
			res.end();
		});
		return;
	}

	if (Object.keys(rules).indexOf(dirs[0]) == -1) {
		url = "main";
		dirs = ["main"];
	}
	// ====

	var body = fs.readFileSync("controlpage/"+body_filename).toString();
	var content = body.replace("{{CONTENT}}",fs.readFileSync("controlpage/"+rules[dirs[0]]).toString());
	for (var field in fields) {
		content = content.replace(new RegExp("\\{"+field+"\\}","g"), function () {
			try {
				return fields[field](query)
			} catch (e) {}
		});
	}
	for (var templateName in templates) {
		var template = templates[templateName];
		content = content.replace(new RegExp("\\{\\{\\{"+templateName+"(.+)\\}\\}\\}", "mgs"), function (full,code) {
			var result = "";
			try {
				var array = template.array(query);
			} catch (e) {return "";}
			for (var i = 0; i < array.length; ++i) {
				var current = code;
				for (var field in template) {
					if (field == "array" || field == "ifempty")
						continue;
					current = current.replace(new RegExp("\\{"+field+"\\}","g"), function () {
						try {
							return template[field](array[i]);
						} catch (e) {}
					});
				}
				result += current;
			}
			if (array.length == 0 && typeof template.ifempty !== "undefined") {
				result = template.ifempty();
			}
			return result;
		});
	}
	res.end(content);
}
