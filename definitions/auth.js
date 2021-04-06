ON('loaded', function() {

	var opt = {};

	opt.secret = CONF.auth_secret;
	opt.cookie = CONF.auth_cookie;
	opt.strict = false;
	opt.expire = '5 minutes';
	opt.ddos = 10;
	opt.options = { samesite: 'lax' };

	opt.onauthorize = function($) {

		if ($.query.accesstoken) {
			$.invalid();
			return true;
		}

		if (CONF.guest && $.cookie(CONF.auth_cookie) === 'guest') {
			$.success(MAIN.guest);
			return true;
		}

	};

	opt.onsession = function(session, $, init) {

		var user = session.data;
		var locked = user.locked == true;

		$.req.$langauge = user.language;

		if (!locked && (user.locking && user.pin && user.dtlogged2 && !$.req.mobile && user.dtlogged2 < NOW.add('-' + user.locking + ' minutes'))) {
			locked = true;
			REPO.sessions.findItem('id', session.sessionid).locked = true;
		}

		$.req.$language = user.language;
		$.req.locked = locked;

		user.ip = $.ip;

		if (user.desktop == null)
			user.desktop = 1;

		if (user.online === false || locked)
			user.online = true;

		if (init || user.dtlogged2.getDate() !== NOW.getDate()) {
			user.mobile = $.req.mobile;
			user.dtlogged2 = NOW;
			user.ua = ($.headers['user-agent'] || '').parseUA();
			FUNC.usage_logged(user);
		}

		if ($.req.url === '/logout/')
			return;

		if ($.req.locked) {
			$.invalid(user);
			return true;
		}

	};

	opt.onread = function(meta, next) {

		var session = REPO.sessions.findItem('id', meta.sessionid);
		if (session) {

			session.online = true;
			session.dtlogged = NOW;

			if (session.logged)
				session.logged++;
			else
				session.logged = 1;

			session.ip = meta.ip;

			MAIN.readuser(meta.userid, function(err, response) {
				if (response) {
					response.rev = GUID(5);
					response.dtlogged2 = session.dtlogged;
					response.locked = session.locked;
					response.profileid = session.profileid;
					var user = REPO.users.findItem('id', meta.userid);
					user.online = true;
					user.dtlogged = NOW;
				}
				next(err, response);
			});
		} else
			next();
	};

	opt.onfree = function(meta) {

		for (var i = 0; i < REPO.sessions.length; i++) {
			var session = REPO.sessions[i];
			if (meta.sessions.indexOf(session.id) !== -1)
				session.online = false;
		}

		if (meta.users.length) {
			for (var i = 0; i < REPO.users.length; i++) {
				var user = REPO.users[i];
				if (meta.users.indexOf(user.id) !== -1)
					user.online = false;
			}
		}

		REPO.sessions = REPO.sessions.remove(session => session.dtexpire < NOW);
	};

	AUTH(opt);
	MAIN.session = opt;

	opt.update = function(userid, fn) {
		for (var m in opt.sessions) {
			var session = opt.sessions[m];
			if (session.userid === userid)
				fn(session.data);
		}
	};

	LOCALIZE(req => req.query.language);
});
