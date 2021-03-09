var express = require('express'),
    request = require('request'),
    cors = require('cors'),
    querystring = require('querystring'),
    cookieParser = require('cookie-parser'),
    // secrets = require('./secrets'),
    SpotifyWebApi = require('spotify-web-api-node'),
    bodyParser = require('body-parser');


const spotifyApi = new SpotifyWebApi({
    clientId: process.env.clientId, //secrets.secrets().clientId,
    clientSecret: process.env.clientSecret, //secrets.secrets().clientSecret,
    redirectUri: 'http://localhost:8888/callback'
});

const redirect_uri = 'http://localhost:8888/callback'; // Your redirect uri

const generateRandomString = function (length) {
    var text = '';
    var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

    for (var i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
};

var stateKey = 'spotify_auth_state';

var app = express();

app.use(express.static(__dirname + '/public'))
    .use(cors())
    .use(cookieParser())
    .use(bodyParser.urlencoded({
        extended: true
    }));

app.get('/login', function (req, res) {

    var state = generateRandomString(16);
    res.cookie(stateKey, state);

    var scope = 'user-read-private user-read-email playlist-modify-public playlist-modify-private';
    res.redirect('https://accounts.spotify.com/authorize?' +
        querystring.stringify({
            response_type: 'code',
            client_id: process.env.clientId, //secrets.secrets().clientId,
            scope: scope,
            redirect_uri: redirect_uri,
            state: state
        }));
});

app.get('/callback', function (req, res) {

    var code = req.query.code || null;
    var state = req.query.state || null;
    var storedState = req.cookies ? req.cookies[stateKey] : null;

    if (state === null || state !== storedState) {
        res.redirect('/#' +
            querystring.stringify({
                error: 'state_mismatch'
            }));
    } else {
        res.clearCookie(stateKey);
        var authOptions = {
            url: 'https://accounts.spotify.com/api/token',
            form: {
                code: code,
                redirect_uri: redirect_uri,
                grant_type: 'authorization_code'
            },
            headers: {
                'Authorization': 'Basic ' + (new Buffer(process.env.clientId + ':' + process.env.clientSecret).toString('base64'))
            },
            json: true
        };

        request.post(authOptions, function (error, response, body) {
            if (!error && response.statusCode === 200) {

                spotifyApi.setAccessToken(body.access_token);

                var access_token = body.access_token,
                    refresh_token = body.refresh_token;

                var options = {
                    url: 'https://api.spotify.com/v1/me',
                    headers: { 'Authorization': 'Bearer ' + access_token },
                    json: true
                };

                request.get(options, function (error, response, body) {
                    console.log(body);
                });

                res.redirect('/#' +
                    querystring.stringify({
                        access_token: access_token,
                        refresh_token: refresh_token
                    }));
            } else {
                res.redirect('/#' +
                    querystring.stringify({
                        error: 'invalid_token'
                    }));
            }
        });
    }
});

app.get('/refresh_token', function (req, res) {

    var refresh_token = req.query.refresh_token;
    var authOptions = {
        url: 'https://accounts.spotify.com/api/token',
        headers: { 'Authorization': 'Basic ' + (new Buffer(process.env.clientId + ':' + process.env.clientSecret).toString('base64')) },
        form: {
            grant_type: 'refresh_token',
            refresh_token: refresh_token
        },
        json: true
    };

    request.post(authOptions, function (error, response, body) {
        if (!error && response.statusCode === 200) {
            var access_token = body.access_token;
            res.send({
                'access_token': access_token
            });
        }
    });
});

const searchSentence = function (sentence) {

    let words = sentence.split(' ');

    let requests = words.map((word) => {
        return spotifyApi.searchTracks(word);
    });

    return Promise.all(requests);
};

//TODO: find better way
const getQuery = function (href) {

    let index = href.indexOf('query=') + 6;
    let paramsPart = href.substring(index);
    index = paramsPart.indexOf('&');
    let query = paramsPart.substring(0, index);
    return query;
}

app.post('/findSongs', async function (req, res) {

    let sentence = req.body.sentence.toLowerCase();

    let results = await searchSentence(sentence);
    let data = [];
    results.map((item) => {

        let word = getQuery(item.body.tracks.href);
        let songs = item.body.tracks.items.filter(function (e) { return e.name.toLowerCase() == word });

        if (songs && songs[0]) {

            var song = songs[0];

            data.push({
                id: song.id,
                name: song.name,
                album_name: song.album.name,
                image: song.album.images[0],
                artist: song.artists[0].name
            });
        }
    });

    res.send(data);
});

app.post('/createPlaylist', function (req, res) {

    let songIds = req.body.songs,
        playlistName = req.body.playlistName;

    if (songIds.length === 0) {
        res.status(401);
        res.send('Please find songs to create playlist!');
        return;
    }

    spotifyApi.createPlaylist(playlistName, { 'description': 'Created by messonger', 'public': true })
        .then(function (data) {

            let href = data.body.external_urls.spotify,
                id = data.body.id,
                tracks = songIds.map(function (elem) {
                    return "spotify:track:" + elem;
                });

            spotifyApi.addTracksToPlaylist(id, tracks)
                .then(function (data2) {

                    res.send({ 'playlistUri': href });

                }, function (err) {
                    console.log('Something went wrong!', err);
                });

        }, function (err) {
            console.log('Something went wrong!', err);
        });

});

app.post('/registerToken', function (req, res) {
    let sentence = req.body.token;
    spotifyApi.setAccessToken(sentence);
    res.send('success');
});

console.log('Listening on 8888');
app.listen(process.env.PORT || 8888)
