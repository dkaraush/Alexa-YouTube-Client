require('colors');
const { spawn } = require('child_process');

function start () {
	var serverprocess = spawn('node', ['server.js']);
	serverprocess.stdout.on('data', data => process.stdout.write(data));
	serverprocess.stderr.on('data', data => process.stderr.write(data));
	serverprocess.on('close', function (code) {
		console.log("Exited on " + code.toString().cyan + " code");
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