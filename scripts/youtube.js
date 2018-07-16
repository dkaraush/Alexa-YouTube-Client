module.exports = function (token) {
	return {
		request: function (method, url, query, accesstoken, data) {
			if (typeof query == 'object') {
				query.key = token;
				var resstr = "";
				for (var key in query)
					resstr += escape(key) + "=" + escape(query[key]);
				query = resstr;
			} else if (typeof query === 'string') {
				if (query.length == 0)
					query="key="+escape(token);
				else query += "&key="+escape(token);
			} else if (typeof query === "undefined") {
				query='key='+escape(token);
			}

			return new Promise((resolve, reject) => {
				var req = https.request({
					method: method,
					hostname: "content.googleapis.com",
					path: path + "?" + query,
					headers: {
						"Authorization": "Bearer " + accesstoken,
						"Content-Type": "application/json"
					}
				}, (res) => {
					var c = [];
					res.on('data', d => c.push(d));
					res.on('end', function () {
						var body = c.join("");
						try {
							body = JSON.parse(body);
						} catch (e) {}
						resolve(body, req.statusCode);
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