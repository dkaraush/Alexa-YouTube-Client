require('colors');
const { spawn } = require('child_process');
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
			// TODO
		}

	});
}

start();

global.exitHandler = function (options, err) {
	if (typeof err !== 'undefined' && err != null && err != 0)
		console.dir(err.stack);
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