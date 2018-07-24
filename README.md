# Alexa-YouTube-Client
An Alexa skill, which allows to search, play, save, rate, comment videos on YouTube.

## Installation

Make sure you have an account to create new custom skill.
1. Clone or download repository.
2. Execute `npm install` and `npm start`.
3. Put YouTube API key to `config.json` and start app again.
```
{
	"port": <port of http/https listening> (default: 8034),
	"server_url": <full https URI, where skill will be hosted>,
	"youtube_api_key": <youtube api key>,
	"youtubedlpath": <how to execute youtube-dl> (optional),
	"controlpage_url": <path, where control page will be> (optional, default: "admin"),
	"credentials": { (optional) <if skill will host HTTPS>
		"key": <path to pem file of private key> (optional),
		"cert": <path to pem file of certificate> (optional)
	},
	"login": <login of controlpage> (optional, default: "admin"),
	"password": <password of controlpage> (optional, default: random string)
}

```

4. Tune **Account Linking**:
- Get OAuth2 client ID and secret in Google API Console .
- Put them into **Account Linking** form.
- Put `https://accounts.google.com/o/oauth2/v2/auth` as Authorization URI & `https://www.googleapis.com/oauth2/v4/token` as Access Token URI
- Put scopes: 
```
https://www.googleapis.com/auth/youtube
https://www.googleapis.com/auth/youtube.force-ssl
https://www.googleapis.com/auth/youtube.readonly
```
- In Google API Console put redirect URLs from **Account Linking** form.
5. Put interaction model from `interaction-model.json`

## Usage
- [✔] Alexa, ask youtube client to play my videos
- [✔] Alexa, ask youtube client to play my liked videos
- [✔] Alexa, ask youtube client to play my disliked videos
- [✔] Alexa, ask youtube client to play {query} videos
- [✔] Alexa, ask youtube client to play category {category}
- [✔] Alexa, ask youtube client to play short {query} videos (> 3 min)
- [✔] Alexa, ask youtube client to play long {query} videos (< 20 min)
- [✖] Alexa, ask youtube client which playlists are available
- [✖] Alexa, ask youtube client to play Xth playlist
- [~] Alexa, ask youtube client to play {query} stream
- [✔] Alexa, ask youtube client to rate current video as liked
- Alexa, ask youtube client to like video     
- Alexa, ask youtube client to dislike video
- Alexa, ask youtube client to remove rating 
- [✔] Alexa, ask youtube client to leave a comment
- [✖] Alexa, ask youtube client to put this video into Xth playlist
