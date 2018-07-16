/*
	utils.js - a file with standard functions
*/

if (typeof fs === "undefined") fs = require("fs");

global.loadJSONFile = function (filename, defaultValue, strong) {
	if (!fs.existsSync(filename)) {
		fs.writeFileSync(filename, JSON.stringify(defaultValue, "", "\t"));
		if (strong)
			throw "Put your data to config file (" + filename + ")";
		else return defaultValue;
	}

	var json;
	try {
		json = JSON.parse(fs.readFileSync(filename).toString());
	} catch (e) {
		console.log("reading " + filename.cyan + ": bad JSON");
		throw e;
	}

	for (var key in defaultValue)
		if (typeof json[key] === "undefined")
			json[key] = defaultValue[key];

	return json;
}

global.saveJSONFile = function (filename, content) {
	if (typeof content !== "string")
		content = JSON.stringify(content, "", "\t");
	fs.writeFileSync(filename, content);
}

global.parseQuery = function (query_string) {
	var query = {};
	var params = query_string.split("&");
	for (var i = 0; i < params.length; ++i) {
		var key = params[i].substring(0, params[i].indexOf("="));
		var value = params[i].substring(params[i].indexOf("=")+1);
		query[decodeURIComponent(key)] = decodeURIComponent(value);
	}
	return query;
}

global.replaceParameters = function (template, parameters) {
	for (var key in parameters)
		template = template.replace("{"+key.toUpperCase()+"}", parameters[key]);
	return template;
}

global.randomString = function (n) {
	return Array.from({length: n}, x => "qwertyuiopasdfghjklzxcvbnm1234567890QWERTYUIOPASDFGHJKLZXCVBNM".split("").random()).join("");
}

global.stringifyQuery = function (obj) {
	var string = "";
	for (var key in obj)
		string += encodeURIComponent(key) + "=" + encodeURIComponent(obj[key]) + "&";
	string = string.substring(0, string.length-1);
	return string;//Array.from(Object.keys(obj), (key, i) => encodeURIComponent(key) + "=" + encodeURIComponent(obj[key]) + (Object.keys(obj).length == i+1 ? "" : "&")).join("");
}

global.getRawQuery = function (req) {
	return (req.url.indexOf("?") >= 0) ? req.url.substring(req.url.indexOf("?")+1) : "";
}

global.upperCaseHeader = function (str) {
	return str.replace(/(^|-)(\w)/g, a => a.toUpperCase());
}

global.dateDifferenceString = function (from, now) {
	var difference = ~~((now - from) / 1000); // in seconds
	if (difference < 60)
		return difference + ` second${difference==1?"":"s"} ago`;
	if (difference < 60*60)
		return ~~(difference/60) + ` minute${~~(difference/60)==1?"":"s"} ago`;
	if (difference < 60*60*24)
		return ~~(difference/3600) + ` hour${~~(difference/3600)==1?"":"s"} ago`;
	if (difference < 60*60*24*30) // 30 days
		return ~~(difference/(60*60*24)) + ` day${~~(difference/3600/24)==1?"":"s"} ago`;
	var d = new Date(from);
	return d.getDate() + " " + months[d.getMonth()] + " " + d.getFullYear();
}

const months = "January,February,March,April,May,June,July,August,September,October,November,December".split(",");
global.datetimeString = function (date) {
	var d = new Date(date);
	return addZeros(d.getHours())+":"+addZeros(d.getMinutes())+":"+addZeros(d.getSeconds())+" "+d.getDate() + " " + months[d.getMonth()] + " " + d.getFullYear();	
}

global.addZeros = function(str, n) {
	if (!n) n = 2;
	if (typeof str !== "string") str = str.toString();
	if (str.length < n)
		return "0".repeat(n - str.length) + str;
	return str;
}

global.headersString = function (headers) {
	return Array.from(Object.keys(headers), k => upperCaseHeader(k) + ": " + headers[k]).join("\n");
}

global.chunkArray = function (myArray, chunk_size){
	var index = 0;
	var arrayLength = myArray.length;
	var tempArray = [];
    
	for (index = 0; index < arrayLength; index += chunk_size) {
		myChunk = myArray.slice(index, index+chunk_size);
	    tempArray.push(myChunk);
    }

	return tempArray;
}

Array.prototype.random = function () {
	return this[~~(Math.random() * (this.length - 1))]
}