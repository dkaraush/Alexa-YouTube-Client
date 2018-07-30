'use strict';

const fs = require('fs');
const https = require('https');
const {spawn} = require('child_process');
const translate = require('google-translate-api');

const categories = {
	"1": "Film & Animation",
	"2": "Autos & Vehicles",
	"10": "Music",
	"15": "Pets & Animals",
	"17": "Sports",
	"18": "Short Movies",
	"19": "Travel & Events",
	"20": "Gaming",
	"21": "Videoblogging",
	"22": "People & Blogs",
	"23": "Comedy",
	"24": "Entertainment",
	"25": "News & Politics",
	"26": "Howto & Style",
	"27": "Education",
	"28": "Science & Technology",
	"29": "Nonprofits & Activism",
	"30": "Movies",
	"31": "Anime/Animation",
	"32": "Action/Adventure",
	"33": "Classics",
	"35": "Documentary",
	"36": "Drama",
	"37": "Family",
	"38": "Foreign",
	"39": "Horror",
	"40": "Sci-Fi or Fantasy",
	"41": "Thriller",
	"43": "Shows",
	"44": "Trailers"
}

module.exports = async function (youtube) {
	return {
		requestHandlers: await requestHandlers(youtube),
		errorHandler: errorHandler
	}
}
const INVOCATION_NAME = "tube player";
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
	},
	{
		name: "AMAZON.HelpIntent",
		_handle(RI, handlerInput, user, slots, res) {
			var speech = `This skill allows to play videos from YouTube. You can ask to play your videos, videos you have liked or disliked. You can also ask to search videos by query or category.
For example: 
\"Alexa, ask ${INVOCATION_NAME} to search for Mozart\"
\"Alexa, ask ${INVOCATION_NAME} to search for Music category\"

More information and categories' list you can view in skill's description.`;
			return res.speak(speech).withStandardCard("Help", speech);
		}
	},
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
		_handle: async function(RI, handlerInput, user, slots, res, hasDisplay, hasVideoApp) {
			if (!user.accessToken) {
				log("accessToken is missing => send linkAccount card");
				return linkFirst(res);
			}
			
			return await runPlaylist(RI, "PlayLikedVideosIntent",
								["GET", "/youtube/v3/videos", {
									part: "snippet,contentDetails",
									maxResults: 50,
									myRating: "like"
								}, user.accessToken],
								youtube, user, res, hasVideoApp);
		}
	},
	{
		name: "PlayDislikedVideosIntent",
		_handle: async function(RI, handlerInput, user, slots, res, hasDisplay, hasVideoApp) {
			if (!user.accessToken) {
				log("accessToken is missing => send linkAccount card");
				return linkFirst(res);
			}
			return await runPlaylist(RI, "PlayDislikedVideosIntent",
								["GET", "/youtube/v3/videos", {
									part: "snippet,contentDetails",
									maxResults: 50,
									myRating: "dislike"
								}, user.accessToken],
								youtube, user, res, hasVideoApp);
		}
	},
	{
		name: "AcceptIntent",
		_handle: async function (RI, handlerInput, user, slots, res, hasDisplay, hasVideoApp) {
			var data = playerData[user.userId];
			if (!data || ["PlayLikedVideosIntent", "PlayDislikedVideosIntent", "SearchVideoIntent",
						  "SearchShortVideoIntent", "SearchLongVideoIntent", "PlayMyVideosIntent",
						  "PlayCategoryIntent", "CommentValueIntent"].indexOf(data.from) == -1)
				return res.speak("What yes?");

			if (data.from == "CommentValueIntent") {
				if (!data.commentValue) {
					error(RI, "Lost comment");
					return err(res);
				}
				if (!data.pitems || typeof data.index === "undefined" || !data.pitems[data.index] || !data)
					return res.speak("No videos are playing right now");

				var video = data.pitems[data.index]
				var videoId = typeof video.id === 'string' ? video.id : video.id.videoId;
				var rData = {
								snippet: {
									topLevelComment: {
										snippet: {
											textOriginal: data.commentValue
										}
									},
									videoId: videoId
								}
							};
				log(RI, "leaving a comment => data: ", rData);
				var response = await youtube.request("POST", "/youtube/v3/commentThreads", {
												part: "snippet",
												alt: "json"
											}, user.accessToken, rData, RI);
				if (!response.kind) {
					warn(RI, "tried to leave a comment => failed");
					warn(RI, response);
					return err(res);
				}
				return res.speak("Done").withStandardCard("Comment posted.", "Posted comment on \"" + data.pitems[data.index].title + "\":\n\n"+data.commentValue);
			}

			return await runVideo(RI, "AcceptIntent", data, true, "REPLACE_ALL", hasVideoApp, youtube, user, res, hasVideoApp);
		}
	},
	{
		name: "AMAZON.NextIntent",
		_handle: async function (RI, handlerInput, user, slots, res, hasDisplay, hasVideoApp) {
			var data = playerData[user.userId];
			if (!data)
				return res.speak("What next?");
			if (!data.nearly)
				data.index++;
			data.nearly = false;
			return await runVideo(RI, "AMAZON.NextIntent", data, true, "REPLACE_ALL", hasVideoApp, youtube, user, res, hasVideoApp);
		}
	},
	{
		name: "AudioPlayer.PlaybackNearlyFinished",
		_handle: async function (RI, handlerInput, user, slots, res, hasDisplay, hasVideoApp) {
			var data = playerData[user.userId];
			if (!data)
				return res.speak("What next?");
			data.index++;
			data.nearly = true;
			return await runVideo(RI, "AudioPlayer.PlaybackNearlyFinished", data, false, "ENQUEUE", hasVideoApp, youtube, user, res, hasVideoApp);
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
			return await runPlaylist(RI, "SearchVideoIntent",
								["GET", "/youtube/v3/search", {
									part: "snippet,id",
									type: "video",
									maxResults: 50,
									q: slots.query.value
								}, null, RI],
								youtube, user, res, hasVideoApp);
		}
	},
	{
		name: "SearchShortVideoIntent",
		_handle: async function (RI, handlerInput, user, slots, res, hasDisplay, hasVideoApp) {
			return await runPlaylist(RI, "SearchShortVideoIntent",
								["GET", "/youtube/v3/search", {
									type: "video",
									part: "snippet,id",
									videoDuration: "short",
									maxResults: 50,
									q: slots.query.value
								}, null, RI],
								youtube, user, res, hasVideoApp);
		}
	},
	{
		name: "SearchLongVideoIntent",
		_handle: async function (RI, handlerInput, user, slots, res, hasDisplay, hasVideoApp) {
			return await runPlaylist(RI, "SearchLongVideoIntent",
								["GET", "/youtube/v3/search", {
									part: "snippet,id",
									type: "video",
									videoDuration: "long",
									maxResults: 50,
									q: slots.query.value
								}, null, RI],
								youtube, user, res, hasVideoApp);
		}
	},
	{
		name: "PlayMyVideosIntent",
		_handle: async function (RI, handlerInput, user, slots, res, hasDisplay, hasVideoApp) {
			if (!user.accessToken) {
				log("accessToken is missing => send linkAccount card");
				return linkFirst(res);
			}
			return await runPlaylist(RI, "PlayMyVideosIntent",
								["GET", "/youtube/v3/search", {
									part: "snippet,id",
									type: "video",
									maxResults: 50,
									forMine: true
								}, user.accessToken, RI],
								youtube, user, res, hasVideoApp);
		}
	},
	{
		name: "DontDescribeVideoIntent",
		_handle: async function (RI, handlerInput, user, slots, res, hasDisplay, hasVideoApp) {
			var data = playerData[user.userId] || {};
			data.describing = false;
			playerData[user.userId] = data;
			return res.speak("Ok, I will not do that again.");
		}
	},
	{
		name: "DescribeVideoIntent",
		_handle: async function (RI, handlerInput, user, slots, res, hasDisplay, hasVideoApp) {
			var data = playerData[user.userId] || {};
			data.describing = true;
			playerData[user.userId] = data;
			return res.speak("Ok, I will continue doing that again.");
		}
	},
	{
		name: "PlayCategoryIntent",
		_handle: async function (RI, handlerInput, user, slots, res, hasDisplay, hasVideoApp) {
			var categoryNum;
			try {
				var status = slots.category.resolutions.resolutionsPerAuthority[0].status.code;
				if (status != "ER_SUCCESS_MATCH") {
					log(RI, "status = \""+status+"\" (must be \"ER_SUCCESS_MATCH\")");
					return res.speak("Category isn't found. Check skill's description for available categories.");
				}
				categoryNum = parseInt(slots.category.resolutions.resolutionsPerAuthority[0].values[0].value.name);
				if (isNaN(categoryNum)) {
					log(RI, "category number is NaN", slots.category.resolutions.resolutionsPerAuthority[0].values[0].value.name);
					return res.speak("Category isn't found. Check skill's description for available categories.");
				}
			} catch (e) {
				warn(RI, "catched err (bad category) ", e);
				return res.speak("Category isn't found. Check skill's description for available categories.");
			}

			var categoryName = categories[categoryNum];
			if (typeof categoryName === 'undefined') {
				log(RI, "category name in categories array is missing", categoryNum, categories);
				return res.speak("Category isn't found. Check skill's description for available categories.");
			} 

			var speech = "Searching for " + categoryName + " category... ";
			return await runPlaylist(RI, "PlayCategoryIntent",
								["GET", "/youtube/v3/search", {
									part: "snippet,id",
									type: "video",
									maxResults: 50,
									videoCategoryId: categoryNum
								}, null, RI],
								youtube, user, res, hasVideoApp, speech);
		}
	},
	{
		name: "AudioPlayer.PlaybackFailed",
		_handle: async function (RI, handlerInput, user, slots, res, hasDisplay, hasVideoApp) {
			var data = playerData[user.userId];
			if (!data) return;
			if (data.downloaded) {
				data.index++;
				data.nearly = false;
				return await runVideo(RI, "AudioPlayer.PlaybackFailed", data, false, "REPLACE_ALL", hasVideoApp, youtube, user, res, hasVideoApp);
			}

			/*
				Sometimes video is not downloaded by Alexa and it responds AudioPlayer.PlaybackFailed
				The only way to fix it, server should download video itself and respond own URL to Alexa.
			*/
			var youtubelink = data.link.value;
			data.downloaded = true;
			return res.addAudioPlayerPlayDirective("REPLACE_ALL", config.server_url + "/videos?" + encodeURIComponent(youtubelink), data.link.id, 0, null)
		}
	},
	{
		name: "CommentRequestIntent",
		_handle: async function (RI, handlerInput, user, slots, res, hasDisplay, hasVideoApp) {
			if (!user.accessToken) {
				log("accessToken is missing => send linkAccount card");
				return linkFirst(res);
			}

			var data = playerData[user.userId];
			if (!data || !data.pitems || !data.pitems[data.index])
				return res.speak("No videos are playing right now.");
			data.from = "CommentRequestIntent";
			return res.speak("Ok, I'm listening.").reprompt();
		}
	},
	{
		name: "CommentValueIntent",
		_handle: async function (RI, handlerInput, user, slots, res, hasDisplay, hasVideoApp) {
			var data = playerData[user.userId];
			var comment = catchAllToString(slots);
			if (!data || !(data.from == "CommentRequestIntent" || data.from == "CommentRepeatIntent")) {
				var command = comment.toLowerCase();
				var words = command.split(" ");
				debug(RI, words)
				if (words[0] == "play" && words[1] == "videos" && words[2] == "i") {
					if (words[3] == 'like' && words.length == 4)
						return startHandler("PlayLikedVideosIntent", handlerInput);
					if (words.slice(3).join(" ").indexOf("like") >= 0)
						return startHandler("PlayDislikedVideosIntent", handlerInput);
				}

				if (words[0] == 'search' && words[1] == 'for') {
					if (words[words.length-1].indexOf('video') >= 0)
						words.splice(words.length-1, 1);
					handlerInput.requestEnvelope.request.intent.slots.query = {value: words.slice(2).join(' ')}
					return startHandler("SearchVideoIntent", handlerInput)
				}

				if (words[0] == 'help') {
					return startHandler("AMAZON.HelpIntent", handlerInput);
				}

				if (words[0] == 'cancel') {
					return startHandler("AMAZON.CancelIntent", handlerInput);
				}

				return res.speak("Sorry, I did not understand. Try again").reprompt("Say again.");
			}
			data.commentValue = comment;
			data.from = "CommentValueIntent";

			return res.speak("Comment text is - \"" + comment + "\". Ready to post?").reprompt("Ready to post?");
		}
	},
	{
		name: "CommentRepeatIntent",
		_handle: async function (RI, handlerInput, user, slots, res, hasDisplay, hasVideoApp) {
			var data = playerData[user.userId];
			if (!data || !(data.from == "CommentValueIntent"))
				return res.speak("Sorry, I did not understand. Try again").reprompt("Say again.");
			data.from = "CommentRepeatIntent";
			return res.speak("Ok, I'm listening.");
		}
	},
	{
		name: "LikeVideoIntent",
		_handle: async function (RI, handlerInput, user, slots, res, hasDisplay, hasVideoApp) {
			if (!user.accessToken) {
				log("accessToken is missing => send linkAccount card");
				return linkFirst(res);
			}
			var data = playerData[user.userId];
			if (!data || !data.pitems || !data.pitems[data.index] || !data.pitems[data.index].id)
				return res.speak("No videos are playing right now.");

			return new Promise((resolve, reject) => {
				youtube.request("POST", "/youtube/v3/videos/rate", {
					rating: 'like',
					id: data.pitems[data.index].id
				}, user.accessToken, RI).then((body) => {				
					if (body.length == 0) {
						resolve(res.speak("Liked."));
					} else {
						error(RI, "wrong body", body);
					}
				}).catch(e => {
					error(RI, "youtube request throwed error", e);
					resolve(err(res));
				})
			});

		}
	},
	{
		name: "DislikeVideoIntent",
		_handle: async function (RI, handlerInput, user, slots, res, hasDisplay, hasVideoApp) {
			if (!user.accessToken) {
				log("accessToken is missing => send linkAccount card");
				return linkFirst(res);
			}
			var data = playerData[user.userId];
			if (!data || !data.pitems || !data.pitems[data.index] || !data.pitems[data.index].id)
				return res.speak("No videos are playing right now.");

			return new Promise((resolve, reject) => {
				youtube.request("POST", "/youtube/v3/videos/rate", {
					rating: 'dislike',
					id: data.pitems[data.index].id
				}, user.accessToken, RI).then((body) => {				
					if (body.length == 0) {
						resolve(res.speak("Disliked."));
					} else {
						error(RI, "wrong body", body);
					}
				}).catch(e => {
					error(RI, "youtube request throwed error", e);
					resolve(err(res));
				})
			});

		}
	},
	{
		name: "NoneRateVideoIntent",
		_handle: async function (RI, handlerInput, user, slots, res, hasDisplay, hasVideoApp) {
			if (!user.accessToken) {
				log("accessToken is missing => send linkAccount card");
				return linkFirst(res);
			}
			var data = playerData[user.userId];
			if (!data || !data.pitems || !data.pitems[data.index] || !data.pitems[data.index].id)
				return res.speak("No videos are playing right now.");

			return new Promise((resolve, reject) => {
				youtube.request("POST", "/youtube/v3/videos/rate", {
					rating: 'none',
					id: data.pitems[data.index].id
				}, user.accessToken, RI).then((body, code) => {				
					if (body.length == 0) {
						resolve(res.speak("Rating removed."));
					} else {
						error(RI, "wrong body", body);
						resolve(err(res));
					}
				}).catch(e => {
					error(RI, "youtube request throwed error", e);
					resolve(err(res));
				})
			});

		}
	},
	{
		name: "AMAZON.PauseIntent",
		_handle(RI, handlerInput, user, slots, res, hasDisplay, hasVideoApp) {
			if (hasVideoApp)
				return res.getResponse();
			var data = playerData[user.userId] || {};
			data.offset = handlerInput.requestEnvelope.context.AudioPlayer.offsetInMilliseconds;
			playerData[user.userId] = data;
			return res.addAudioPlayerStopDirective().getResponse();
		}
	},
	{
		name: "AMAZON.ResumeIntent",
		_handle: async function(RI, handlerInput, user, slots, res, hasDisplay, hasVideoApp) {
			var data = playerData[user.userId];
			if (!data) return res;
			return await runVideo(RI, "AMAZON.ResumeIntent", data, false, "REPLACE_ALL", hasVideoApp, youtube, user, res);
		}
	},
	{
		name: "AMAZON.StopIntent",
		_handle: function (RI, handlerInput, user, slots, res, hasDisplay) {
			return res.speak("Stopped.").addAudioPlayerStopDirective();
		}
	},
	{
		name: "AMAZON.CancelIntent",
		_handle: function (RI, handlerInput, user, slots, res, hasDisplay) {
			return res.speak("Cancelled.").addAudioPlayerStopDirective();
		}
	}
	];

	function startHandler(name, input) {
		var req = reqs.find(h => h.name == name);
		if (!req)
			req = reqs.find(h => h.name == "AMAZON.FallbackIntent");
		return req.handle(input);
	}

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
						if (handler.name !== "AMAZON.FallbackIntent" && handlerInput.requestEnvelope.session) {
							var attr = handlerInput.attributesManager.getSessionAttributes();
							attr.lastRequest = handler.name;
							handlerInput.attributesManager.setSessionAttributes(attr);
						}
						resolve(val);
					});
				});
			}
		}, () => {
			ret(reqs)
		});
	});
}

function catchAllToString(slots) {
	var words = [];
	for (var i = 0; i < 100; ++i) {
		var strSlot = i.toString().replace(/\d/g, n => "qwertyuiopasdfghjklz"[n]);
		if (slots[strSlot].value)
			words.push(slots[strSlot].value);
		else break;
	}
	var string = words.join(" ");
	string = string.replace(/^(\w)/g, s => s.toUpperCase());
	string = string.replace(/(\.[ ]{0,}|\?[ ]{0,})(\w)/g, (f, s, d) => s+d.toUpperCase());
	string = string.replace(/nt(\W|$)/g, "n't$1");
	return string;
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
async function runVideo(RI, requestname, data, cantalk, behavior, type, youtube, user, res, speech) {
	data.downloaded = false;
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
		requestargs[requestargs.length-1] = RI;
		var r = await youtube.request(...requestargs);
		r.items = r.items.filter(i => typeof getID(i) !== 'undefined');

		if (['youtube#searchListResponse', 'youtube#videoListResponse'].indexOf(r.kind) < 0) {
			error(RI, "we received something wrong (non-valid kind of response)", r);
			return cantalk ? err(res) : res;
		}

		if (r.items.length != 0) {
			if (typeof r.items[0].contentDetails === "undefined") {
				log("missing duration => requesting contentDetails");
				var dr = await youtube.request("GET", "/youtube/v3/videos", {
					part: "contentDetails",
					id: Array.from(items, i => getID(i)).join(",")
				}, user.accessToken, RI);
				if (dr.kind != "youtube#videoListResponse" || dr.items.length != r.items.length)  {
					error(RI, "we received something wrong (non-valied kind of response)", r);
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

	var videoId = getID(data.pitems[data.index]);
	if (!videoId) {
		warn(RI, "id field in playerData is missing!", data);
		return cantalk ? err(res) : res;
	}

	if (data.describing && requestname != "AcceptIntent" && cantalk) {
		res = res.speak((speech ? speech : "") + "Playing " + (await translate(data.pitems[data.index].title)).text + "... It's duration: " + speechDuration(data.pitems[data.index].duration));
	}
	if (data.link && data.link.index == data.index && data.link.id == videoId && (Date.now() - data.link.time) < 1000*60*60) {
		log(RI, "we already have a link to video => not running youtube-dl");
		var waslasttoken = data.lastToken;
		data.lastToken = videoId;
		var offset = 0;
		if (data.offset) {
			offset = data.offset;
			data.offset = 0;
		}
		if (type)
			return res.addVideoAppLaunchDirective(data.link.value);
		return res.addAudioPlayerPlayDirective(behavior, data.link.value, videoId, offset, behavior == "ENQUEUE" ? waslasttoken : null);
	}
	return new Promise((resolve, reject) => {
		youtubedl(videoId, type, RI)
			.then(link => {
				data.link = {id: videoId, index: data.index, value: link, time: Date.now()};
				var waslasttoken = data.lastToken;
				data.lastToken = videoId;
				var offset = 0;
				if (data.offset) {
					offset = data.offset;
					data.offset = 0;
				}
				if (type)
					resolve(res.addVideoAppLaunchDirective(link));
				else resolve(res.addAudioPlayerPlayDirective(behavior, link, videoId, offset, behavior == "ENQUEUE" ? waslasttoken : null));
			})
			.catch(e => {
				resolve(cantalk ? err(res) : res);
			})
	});
}
function getID(videoitem) {
	return typeof videoitem.id === "string" ? videoitem.id : videoitem.id.videoId;
}
function youtubedl(id, type, RI) {
	return new Promise(async function (resolve, reject) {
		var resolved = false;
		
		debug("[youtube-dl] getting available formats... (args: " + ["-F", "https://www.youtube.com/watch?v="+id].join(" ") + ")");
		var youtubedl = spawn(config.youtubedlpath || "youtube-dl.exe", ["--no-cache-dir", "-f", (type ? "mp4" : "m4a"), "-g", "https://www.youtube.com/watch?v=" + id]);
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
			error(RI, "[youtube-dl] stderr: ", data);
		});
		youtubedl.on('close', function () {
			if (!resolved) {
				error(RI, "[youtube-dl] closed");
				reject();
			}
		})
	})
}
async function runPlaylist(RI, intentname, requestargs, youtube, user, res, type, beforespeech) {
	var ra = requestargs.concat([RI]);
	var r = await youtube.request(...ra);

	if (["youtube#searchListResponse", "youtube#videoListResponse"].indexOf(r.kind) < 0) {
		error(RI, "we received something wrong (non-valied kind of response)", r);
		return err(res);
	}

	var items = r.items.filter(i => typeof getID(i) !== "undefined");
	if (items.length == 0) {
		log(RI, "items.length == 0  => empty playlist");
		return res.speak("Empty.");
	}
	if (typeof items[0].contentDetails === "undefined") {
		log(RI, "missing contentDetails => requesting from YouTube");
		var dr = await youtube.request("GET", "/youtube/v3/videos", {
			part: "id,contentDetails",
			maxResults: 50,
			id: Array.from(items, i => getID(i)).join(",")
		}, null, RI);
		if (dr.kind != "youtube#videoListResponse")  {
			error(RI, "we received something wrong (non-valied kind of response)", dr);
			return err(res);
		}
		for (var i = 0; i < items.length; ++i) {
			var found = false;
			for (var j = 0; j < dr.items.length; ++j) {
				if (getID(dr.items[j]) == getID(items[i])) {
					found = true;
					items[i].contentDetails = dr.items[j].contentDetails;
				}
			}
			if (!found) {
				items.splice(i, 1);
				i--;
			}
		}
	}
	if (items.length == 0) {
		log(RI, "(after contentdetails) items.length == 0  => empty playlist");
		return res.speak("Empty.");
	}
	log(RI, "received " + r.pageInfo.totalResults + " videos");
	var speech = beforespeech || "";
	var data = playerData[user.userId];
	data = playerData[user.userId] = {
		from: intentname,
		req: requestargs,
		pitems: Array.from(items, i => {return {id: i.id, title: i.snippet.title, duration: i.contentDetails.duration}}),
		length: r.pageInfo.totalResults,
		nextpagetoken: r.nextPageToken,
		index: 0,
		describing: typeof data === "undefined" || typeof data.describing === "undefined" ? true : data.describing
	};
	if (data.describing) {
		if (items[0].contentDetails.duration != "PT0S") {
			if (r.pageInfo.totalResults < 1000)
				speech += "There are " + r.pageInfo.totalResults + " video" + (r.pageInfo.totalResults>1?"s":"") + ". ";
			speech += "First video is: ";
			speech += await describeVideo(items[0]);
			speech += ". Shall I play it?";
		} else {
			log(RI, "first is live stream: playing it");
			speech += "I found live stream. ";
			speech += await describeVideo(items[0]);
			speech += ". Shall I play it?";
		} 
	}
	res = res.withStandardCard("Playlist", r.pageInfo.totalResults + " videos.\n\n" + Array.from(items.slice(0, 10), function (item, i) {
		return (i+1) + ". " + (item.snippet.title) + " [" + (item.contentDetails.duration == 'PT0S' ? "LIVE" : numericDuration(item.contentDetails.duration)) + "]";
	}).join("\n"));
	if (data.describing)
		return res.speak(speech).reprompt('Shall I play it?');
	else {
		return await runVideo(RI, intentname, data, true, "REPLACE_ALL", type, youtube, user, res);
	}
}
function linkFirst(r) {
	return r.speak("To use this feature you have to link your YouTube account first. Check your mobile phone.")
			.withLinkAccountCard();
}
function err(r) { 	
	return r.speak("Something went wrong. Try again later.");
}
function describeVideo(video) {
	return new Promise((resolve) => {
		translate(video.snippet.title).then(res => {
			var title = res.text;

			title = title.replace(/\&/g, " and ");

			var duration = speechDuration(video.contentDetails.duration);		
			if (video.contentDetails.duration == "PT0S") {
				duration = null;
			}

			resolve(title + ". "+(duration!=null?("It's duration: " + duration):""));
		})
	})
}
function speechDuration(duration) {
	var dMatch = duration.match(/^PT(\d+H){0,1}(\d+M)(\d+S)$/);
	if (dMatch != null && dMatch.length == 4) {
		var mwords = {H: "hour", M: "minute", S: "second"};
		var	res = Array.from(dMatch.slice(1), d => {
			if (typeof d === "undefined") 
				return "";
			var m = d[d.length-1];
			if (m == "S") 
				return "";
			var n = parseInt(d.substring(0, d.length-1));
			return n + " " + mwords[m] + (n>1?"s":"");
		}).join(" ");
		if (res == "")
			res = "less 1 minute";
		return res;
	}
	return null;
}
function numericDuration(duration) {
	return duration.replace(/^PT(?:(\d+)H){0,1}(?:(\d+)M){0,1}(?:(\d+)S)/g,(m,p1,p2,p3)=>(!p1?"00":(p1.length>1?p1:"0"+p1))+":"+(!p2?"00":(p2.length>1?p2:"0"+p2))+":"+(!p3?"00":(p3.length>1?p3:"0"+p3)));
}