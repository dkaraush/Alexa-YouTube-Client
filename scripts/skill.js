'use strict';

const {spawn} = require('child_process');
const translate = require('google-translate-api');

module.exports = async function (youtube) {
	return {
		requestHandlers: await requestHandlers(youtube),
		errorHandler: errorHandler
	}
}

var requestHandlers = function (youtube) {
	var reqs = [{
		name: "LaunchRequest",
		_handle(RI, handlerInput, user, slots, res) {
			return res.speak("Youtube Client opened. Tell me what to play.").reprompt("Tell me what to play");	
		}
	},
	{
		name: "AMAZON.FallbackIntent",
		_handle(RI, handlerInput, user, slots, res) {
			return res.speak("Sorry, I did not understand. Say again.").reprompt("Say again");
		}
	}
	{
		name: "SessionEndedRequest",
		_handle(RI, handlerInput, user, slots, res) {
			return res.speak("Session ended.");
		}
	},
	{
		name: "AMAZON.HelpIntent",
		_handle(RI, handlerInput, user, slots, res) {
			return res.speak("Tell me what to play").reprompt();
		}
	},
	{
		name: "PlayLikedVideosIntent",
		_handle: async function(RI, handlerInput, user, slots, res) {
			return await runPlaylist(RI, "PlayLikedVideosIntent",
								["GET", "/youtube/v3/videos", {
									part: "snippet,contentDetails",
									maxResults: 50,
									myRating: "like"
								}, user.accessToken, RI],
								youtube, user, res);
		}
	},
	{
		name: "PlayDislikedVideosIntent",
		_handle: async function(RI, handlerInput, user, slots, res) {
			return await runPlaylist(RI, "PlayDislikedVideosIntent",
								["GET", "/youtube/v3/videos", {
									part: "snippet,contentDetails",
									maxResults: 50,
									myRating: "dislike"
								}, user.accessToken, RI],
								youtube, user, res);
		}
	},
	{
		name: "AcceptIntent",
		_handle: async function (RI, handlerInput, user, slots, res, hasDisplay, hasVideoApp) {
			var data = playerData[user.userId];
			if (!data || ["PlayLikedVideosIntent", "PlayDislikedVideosIntent"].indexOf(data.from) == -1)
				return res.speak("What yes?");

			return await runVideo(RI, data, true, "REPLACE_ALL", hasVideoApp, youtube, user, res);
		}
	},
	{
		name: "RefuseIntent",
		_handle: async function (RI, handlerInput, user, slots, res, hasDisplay, hasVideoApp) {
			return res.speak("Ok.");
		}
	},
	{
		name: "SearchVideoIntent",
		_handle: async function (RI, handlerInput, user, slots, res, hasDisplay, hasVideoApp) {
			return await runPlaylist("SearchVideoIntent",
								["GET", "/youtube/v3/search", {
									part: "snippet,id",
									maxResults: 50,
									q: slots.query.value
								}, user.accessToken, RI],
								youtube, user, res);
		}
	}
	];


	return new Promise(ret => {
		reqs.forEachEnd(handler => {
			var allNames = [];
			allNames.push(handler.name);
			if (typeof handler.alternatives === "string")
				allNames.push(handler.alternatives);
			else if (Array.isArray(handler.alternatives))
				allNames = allNames.concat(handler.alternatives);
			handler.conditions = Array.from(allNames, name => {
				var parsedName = name.match(/AudioPlayer\.|PlaybackController\.|[A-Z][a-z.]+|AMAZON\./g);
				if (parsedName == null)
					return;
				if (parsedName[parsedName.length-1] == "Handler")
					parsedName.splice(parsedName.length - 1, 1);

				if (parsedName[parsedName.length-1] == "Request" || parsedName[0] == "AudioPlayer." || parsedName[0] == "PlaybackController.") {
					var requestName = name;
					return (handlerInput) => handlerInput.requestEnvelope.request.type == requestName;
				} else if (parsedName[parsedName.length - 1] == "Intent") {
					return function (handlerInput) {
						return handlerInput.requestEnvelope.request.type == "IntentRequest" &&
								 handlerInput.requestEnvelope.request.intent.name == name;
					};
				} else {
					console.log("Handler doesn't have its request: " + name);
				}
			});
			handler.canHandle = function (handlerInput) {
				for (var i = 0; i < handler.conditions.length; ++i) {
					if (handler.conditions[i](handlerInput))
						return true;
				}
				return false;
			}

			handler.handle = function (handlerInput) {
				var RI = handlerInput.requestEnvelope.request.requestId;
				var hasVideoApp = Object.keys(handlerInput.requestEnvelope.context.System.device.supportedInterfaces).indexOf("VideoApp")>=0;
				var hasDisplay = Object.keys(handlerInput.requestEnvelope.context.System.device.supportedInterfaces).indexOf("Display")>=0;
				var user = handlerInput.requestEnvelope.context.System.user;
				var slots = handlerInput.requestEnvelope.request.intent ? handlerInput.requestEnvelope.request.intent.slots : null;
				var res = handler._handle(RI, handlerInput, user, slots, handlerInput.responseBuilder, hasDisplay, hasVideoApp);
				return new Promise((resolve, reject) => {
					Promise.resolve(res).then(function (val) {
						if (typeof val.getResponse === "function")
							val = val.getResponse();
						resolve(val);
						if (handler.name !== "AMAZON.FallbackIntent" && handlerInput.requestEnvelope.session) {
							var attr = handlerInput.attributesManager.getSessionAttributes();
							attr.lastRequest = handler.name;
							handlerInput.attributesManager.setSessionAttributes(attr);
						}
					});
				});
			}
		}, () => {
			ret(reqs)
		});
	});
}

var errorHandler = {
	canHandle() {
		return true;
	},
	handle(handlerInput, error) {
		console.dir(error);

		return handlerInput.responseBuilder
			.speak('Sorry, I didn\'t understand. Try again.')
			.reprompt('Say again.');
	}
}
async function runVideo(RI, data, cantalk, behavior, type, youtube, user, res) {
	if (data.index >= data.length) {
		log(RI, "index >= length  =>  playlist ended");
		if (cantalk) 
			res = res.speak("Playlist ended.");
		return res; // playlist ended
	}
	if (data.index >= data.pitems.length) {
		// we have to request new page of videos
		log(RI, "index >= items.length  =>  we should request new page of videos");

		var requestargs = data.req;
		requestargs[2].pageToken = data.nextpagetoken;
		var r = await youtube(...requestargs);

		if (['youtube#searchListResponse', 'youtube#videoListResponse'].indexOf(r.kind) < 0) {
			err(RI, "we received something wrong (non-valid kind of response)", r);
			return cantalk ? err(res) : res;
		}

		if (r.items.length != 0) {
			if (typeof r.items[0].contentDetails === "undefined") {
				log("missing duration => requesting contentDetails");
				var dr = await youtube.request("GET", "/youtube/v3/videos", {
					part: "contentDetails",
					id: Array.from(items, i => i.id).join(",")
				}, user.accessToken, RI);
				if (dr.kind != "youtube#videoListResponse" || dr.items.length != r.items.length)  {
					err(RI, "we received something wrong (non-valied kind of response)", r);
					return err(res);
				}
				for (var i = 0; i < items.length; ++i)
					r.items[i].contentDetails = {duration: dr.items[i].contentDetails.duration};
			}

			// add new videos to playlist
			data.pitems = data.pitems.concat(Array.from(r.items, i => {return {id: i.id, title: i.snippet.title, duration: i.contentDetails.duration}}));
			data.nextpagetoken = r.nextPageToken;
		}
	}

	var videoId = data.pitems[data.index].id;
	if (!videoId) {
		warn(RI, "id field in playerData is missing!", data);
		return cantalk ? err(res) : res;
	}

	if (data.link && data.link.index == data.index && data.link.id == videoId && (Date.now() - data.link.time) < 1000*60*60) {
		log(RI, "we already have a link to video => not running youtube-dl");
		var waslasttoken = data.lastToken;
		data.lastToken = videoId;	
		if (type)
			return res.addVideoAppLaunchDirective(data.link.value);
		return res.addAudioPlayerPlayDirective(behavior, data.link.value, videoId, 0, waslasttoken);
	}
	return new Promise((resolve, reject) => {
		youtubedl(videoId, type, RI)
			.then(link => {
				data.link = {id: videoId, index: data.index, value: link, time: Date.now()};
				var waslasttoken = data.lastToken;
				data.lastToken = videoId;
				if (type)
					resolve(res.addVideoAppLaunchDirective(link));
				else resolve(res.addAudioPlayerPlayDirective(behavior, link, videoId, 0, waslasttoken));
			})
			.catch(e => {
				resolve(cantalk ? err(res) : res);
			})
	});
}
function youtubedl(id, type, RI) {
	return new Promise((resolve, reject) => {
		var resolved = false;
		var youtubedl = spawn(config.youtubedlpath || "youtube-dl.exe", ["--format", (type ? 140 : 22), "-g", "https://www.youtube.com/watch?v=" + id]);
		youtubedl.stdout.on('data', function (data) {
			if (resolved) return;
			if (typeof data !== "string") data = data.toString();
			if (data[data.length - 1] == '\n') data = data.substring(0, data.length - 1);
			if (data.substring(0, "https://".length) == "https://") {
				resolve(data);
				resolved = true;
			}
		});
		youtubedl.stderr.on('data', function (data) {
			if (resolved) return;
			if (typeof data !== "string") data = data.toString();
			err(RI, "youtube-dl stderr: ", data);
			reject(data);
		})
	})
}
async function runPlaylist(RI, intentname, requestargs, youtube, user, res) {
	if (!user.accessToken) {
		log("accessToken is missing => send linkAccount card");
		return linkFirst(res);
	}

	var r = await youtube.request(...requestargs);

	if (["youtube#searchListResponse", "youtube#videoListResponse"].indexOf(r.kind) < 0) {
		err(RI, "we received something wrong (non-valied kind of response)", r);
		return err(res);
	}

	var items = r.items;
	if (items.length == 0) {
		log(RI, "items.length == 0  => empty playlist");
		return res.speak("Empty.");
	}
	if (typeof items[0].contentDetails === "undefined") {
		log("missing contentDetails => requesting from YouTube");
		var dr = await youtube.request("GET", "/youtube/v3/videos", {
			part: "contentDetails",
			id: Array.from(items, i => i.id).join(",")
		}, user.accessToken);
		if (dr.kind != "youtube#videoListResponse" || dr.items.length != items.length)  {
			err(RI, "we received something wrong (non-valied kind of response)", r);
			return err(res);
		}
		for (var i = 0; i < items.length; ++i)
			items[i].contentDetails = {duration: dr.items[i].contentDetails.duration};
	}
	var speech = "";
	speech += "There are " + r.pageInfo.totalResults + " video" + (r.pageInfo.totalResults>1?"s":"") + ". ";
	speech += "First video is: ";
	speech += await describeVideo(items[0], res);
	speech += ". Shall I play it?";
	playerData[user.userId] = {
		from: intentname,
		req: requestargs,
		pitems: Array.from(items, i => {return {id: i.id, title: i.snippet.title, duration: i.contentDetails.duration}}),
		length: r.pageInfo.totalResults,
		nextpagetoken: r.nextPageToken,
		index: 0
	};
	return res.speak(speech).reprompt('Shall I play it?');
}
function linkFirst(r) {
	return r.speak("To use this feature you have to link your YouTube account first. Check your mobile phone.");
}
function err(r) {
	console.log((new Error()).stack);
	return r.speak("Something went wrong. Try again later.");
}
function describeVideo(video) {
	return new Promise((resolve) => {
		translate(video.snippet.title, {to: "en"}).then(res => {
			var title = res.text;

			title = title.replace(/\&/g, " and ");

			var duration = null;
			var dMatch = video.contentDetails.duration.match(/^PT(\d+H){0,1}(\d+M)(\d+S)$/);
			if (dMatch != null && dMatch.length == 4) {
				var mwords = {H: "hour", M: "minute", S: "second"};
				duration = Array.from(dMatch.slice(1), d => {
					if (typeof d === "undefined") return "";
					var m = d[d.length-1];
					if (m == "S") return "";
					var n = parseInt(d.substring(0, d.length-1));
					return n + " " + mwords[m] + (n>1?"s":"");
				}).join(" ");
				if (duration == "")
					duration = "less 1 minute";
			}

			resolve(title + ". "+(duration!=null?("It's duration: " + duration):""));
		})
	})
}