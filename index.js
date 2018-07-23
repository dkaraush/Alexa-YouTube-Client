require('colors');

const project_url = "https://codeload.github.com/dkaraush/Alexa-YouTube-Client/zip/master";
const { spawn } = require('child_process');
const https = require("https");
const fs = require('fs');
const unzip = require("unzip");

const dontRemove = [
	"./.git",
	"./master.zip",
	"./config.json",
	"./playerData.json",
	"./controlpage/data"
]

var serverprocess;

function start () {
	serverprocess = spawn('node', ['server.js']);
	serverprocess.stdout.on('data', data => process.stdout.write(data));
	serverprocess.stderr.on('data', data => process.stderr.write(data));
	serverprocess.on('close', function (code) {
		console.log("Exited on " + (code || "SIGINT").toString().magenta + " " + (code ? "code" : "signal"));
		if (code == 36) {
			console.log("Restarting...".green);
			start();
		} else if (code == 37) {
			console.log("Updating code...".blue);
			update(start);
		}

	});
}
function update(cb) {
	console.log("downloading zip from github...");
	https.get(project_url, req => {
		var chunks = [];
		req.on('data', chunk => chunks.push(chunk));
		req.on('end', async function () {
			fs.writeFileSync("master.zip", Buffer.concat(chunks));
			console.log("zip downloaded");
			
			console.log("deleting files...");
			await removeFiles();
			console.log("files removed.");

			console.log("unzipping...");

			// unzip
			fs.createReadStream('master.zip')
				.pipe(unzip.Parse())
				.on('entry', function (entry) {
					var fileName = entry.path;
					var type = entry.type; // 'Directory' or 'File'
					var size = entry.size;
					fileName = fileName.substring(fileName.indexOf("/")+1);
					if (fileName == "") {
						entry.autodrain();
						return;
					}

					if (!fs.existsSync(fileName) && type == 'File') {
						entry.pipe(fs.createWriteStream(fileName));
					} else if (!fs.existsSync(fileName) && type == 'Directory') {
						fs.mkdirSync(fileName);
						entry.autodrain();
					} else 
						entry.autodrain();
				}).on('finish', function () {
					fs.unlinkSync("master.zip");
				  	console.log('unzipped');
				  	console.log('installing npm packages');
				  	var npm = spawn(/^win/.test(process.platform)?'npm.cmd':'npm', ["install"]);
				  	npm.on('close', function (code) {
				  		if (code != 0) {
				  			console.log('something went wrong!');
				  		} else if (cb)
				  			cb();
				  	})
				});
		});
	});
}
if (process.argv.indexOf("update") >= 0) {
	update(null);
} else {
	start();
}

async function removeFiles(path) {
	if (!path) path = "./";
	if (path == "./controlpage/data/" || path == "./.git/" || path == "./node_modules/")
		return;

	var files = fs.readdirSync(path);
	for (var i = 0; i < files.length; ++i) {
		if (dontRemove.indexOf(path + files[i]) == -1) {
			if (fs.lstatSync(path + files[i]).isDirectory()) {
				await removeFiles(path + files[i] + "/");
			} else {
				fs.unlinkSync(path + files[i]);
			}
		}
	}
	if (fs.readdirSync(path).length == 0)
		fs.rmdirSync(path);
	return;
}

global.exitHandler = function (options, err) {
	if (typeof err !== 'undefined' && err != null && err != 0)
		console.log	(err.stack);
	if (!serverprocess.killed) {
		serverprocess.stdin.write("S");
	}
}

process.on('SIGINT', exitHandler.bind(null, {exit:true}));
process.on('SIGTERM', exitHandler.bind(null, {exit:true}));
process.on('SIGUSR1', exitHandler.bind(null, {exit:true}));
process.on('SIGUSR2', exitHandler.bind(null, {exit:true}));
process.on('uncaughtException', exitHandler.bind(null, {exit:false}));
process.on('unhandledRejection', exitHandler.bind(null, {exit: false}));