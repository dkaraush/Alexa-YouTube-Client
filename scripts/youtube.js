var https = require('https');

module.exports = function (token) {
	return {
		request: function (method, path, query, accesstoken, data, RI) {
			if (arguments.length == 5) {
				RI = data;
				data = undefined;
			}

			// add api key to query
			if (typeof query == 'object') {
				query.key = token;
				var resstr = [];
				for (var key in query)
					resstr.push(encodeURIComponent(key) + "=" + encodeURIComponent(query[key]));
				query = resstr.join("&");
			} else if (typeof query === 'string') {
				if (query.length == 0)
					query="key="+encodeURIComponent(token);
				else query += "&key="+encodeURIComponent(token);
			} else if (typeof query === "undefined") {
				query='key='+encodeURIComponent(token);
			}

			return new Promise((resolve, reject) => {
				var headers = {"Content-Type": "application/json"};
				if (accesstoken)
					headers.Authorization = "Bearer " + accesstoken;
				var options = {
					method: method,
					hostname: "content.googleapis.com",
					path: path + "?" + query,
					headers: headers
				};
				debug(RI, "[youtube api] request arguments: ", options)
				var req = https.request(options, (res) => {
					var c = [];
					res.on('data', d => c.push(d));
					res.on('end', function () {
						var body = c.join("");
						try {
							body = JSON.parse(body);
						} catch (e) {}
						resolve(body);
					})
				});
				if (typeof data === "object")
					data = JSON.stringify(data);
				if (typeof data === "string" ||
					data instanceof Buffer)
					req.write(data);
				req.end();
			});
		}
	}
}