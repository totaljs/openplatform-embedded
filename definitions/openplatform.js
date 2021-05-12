require('dbms').init('textdb', ERROR('DBMS'));

// Constants
const Path = require('path');
const Fs = require('fs');
const DB_LOGGED = { online: true };
const DDOS_MAX_ATTEMPS = 10;

var OTP = {};
var OTPCOUNT = 0;
var SIMPLECACHE = {};
var DDOS = {};
var ORIGINERRORS = {};

// Database
REPO.users = [];
REPO.users_apps = [];
REPO.groups = [];
REPO.groups_apps = [];
REPO.roles = [];
REPO.apps = [];
REPO.roles = [];
REPO.sessions = [];
REPO.oauth = [];
REPO.members = [];

MAIN.id = 0;                   // Current ID of OpenPlatform
MAIN.version = 4902;           // Current version of OpenPlatform
MAIN.embedded = true;
// MAIN.guest                  // Contains a guest user instance
// MAIN.apps                   // List of all apps
// MAIN.roles                  // List of all roles (Array)
// MAIN.rolescache             // List of all roles (Object)
// MAIN.groups                 // List of all groups (Array)
// MAIN.groupscache            // List of all groups (Object)

MAIN.meta = {};
MAIN.metadirectories = {};

// Temporary
var USERS = {};

MAIN.logout = function(controller) {
	if (CONF.oauthopenplatform && CONF.allowoauthsync)
		controller.redirect(CONF.oauthopenplatform + '/logout/');
	else
		controller.redirect('/');
};

MAIN.readuser = readuser;

DBMS.audit(function($, data, message) {

	var model = {};
	model.type = $.ID;
	model.userid = $.user ? $.user.id : null;
	model.username = $.user ? $.user.name : '';
	model.message = message;

	if ($.headers)
		model.ua = $.ua || ($.headers['user-agent'] || '').toString(30);

	if ($.id)
		model.rowid = $.id.substring(50);

	model.ip = $.ip;
	model.dtcreated = NOW = new Date();

	if (data) {
		data.password = undefined;
		data.screenshot = undefined;
		model.data = JSON.stringify(data);
	}

	this.insert('logs', model).nobind();
});

FUNC.clearcache = function(userid, appid) {

	if (!appid && !userid) {
		SIMPLECACHE = {};
		USERS = {};
		return;
	}

	for (var m in SIMPLECACHE) {
		var cache = SIMPLECACHE[m];
		if ((appid && cache.app.id === appid) || (userid && cache.user.id === userid))
			delete SIMPLECACHE[m];
	}

	if (userid) {
		for (var m in USERS) {
			var cache = USERS[m];
			if (cache.id === userid)
				delete USERS[m];
		}
	}

};

FUNC.loginid = function(controller, userid, callback, note) {
	FUNC.cookie(controller, userid, callback, note);
};

FUNC.loginotp = function(login, code, callback) {

	var meta = OTP[login];
	if (meta == null) {
		callback('error-otp-session', null);
		return;
	}

	if (MODULE('totp').totpverify(meta.otpsecret, code) != null) {
		OTPCOUNT--;
		delete OTP[login];
		callback(null, meta.id);
	} else
		callback('error-otp-code');
};

FUNC.nicknamesanitize = function(value) {
	var builder = [];
	for (var i = 0; i < value.length; i++) {
		var c = value.charCodeAt(i);
		if ((c < 48 && c !== 32) || (c > 57 && c < 65) || (c > 90 && c < 97) || (c > 123 && c < 128))
			continue;
		if (c === 32 && value.charCodeAt(i + 1) === 32)
			continue;
		builder.push(value[i]);
	}
	return builder.join('');
};

FUNC.login = function(login, password, callback, skip) {

	var done = function(err, id, response) {

		if (err || !id) {
			callback(err);
			return;
		}

		if (response.otp) {
			if (!OTP[login])
				OTPCOUNT++;
			OTP[login] = { date: NOW.add('2 minutes'), id: response.id, otpsecret: response.otpsecret };
			callback(null, 'otp');
			return;
		}

		callback(err, id);
	};

	var response = REPO.users.findItem('login', login);
	if (response) {
		if (FUNC.customlogin) {
			FUNC.customlogin(login, password, response, (err, is) => done(err, !err && is ? response.id : null, response));
			return;
		} else if (CONF.ldap_active && response.dn) {
			var opt = {};
			opt.ldap = FUNC.ldap_host();
			opt.user = response.dn;
			opt.password = password;
			LDAP(opt, function(err, profile) {
				if (profile)
					done(null, response.id, response);
				else
					callback();
			});
			return;
		} else if (response.password === password.hash(CONF.hashmode || 'sha256', CONF.hashsalt)) {
			done(null, response.id, response);
			return;
		}
	} else if (CONF.ldap_active && !skip) {
		// Tries to find user in LDAP
		FUNC.ldap_import(login, function(err, id) {
			if (id)
				FUNC.login(login, password, callback, true);
			else
				callback();
		});
		return;
	}

	callback();
};

FUNC.logout = function(controller) {

	if (controller.sessionid) {

		var index = REPO.sessions.findIndex('id', controller.sessionid);
		if (index !== -1) {
			REPO.sessions.splice(index, 1);
			FUNC.save('sessions');
		}

		controller.ID = 'Logout';
		DBMS().log(controller);
		MAIN.session.logout(controller);

	} else if (controller.user && controller.user.guest)
		controller.cookie(MAIN.session.cookie, '', '-1 day');

	MAIN.logout(controller);
};

FUNC.cookie = function(controller, user, sessionid, callback, note) {

	if (typeof(sessionid) === 'function') {
		note = callback;
		callback = sessionid;
		sessionid = null;
	}

	var id;

	if (typeof(user) === 'string') {
		id = user;
		user = null;
	} else
		id = user.id;

	DB_LOGGED.verifytoken = GUID(15);

	var expiration = CONF.cookie_expiration || '3 days';

	if (!sessionid)
		sessionid = UID();

	REPO.sessions.push({ id: sessionid, userid: id, dtcreated: NOW, ip: controller.ip, ua: controller.ua, referrer: note, dtexpire: NOW.add(expiration) });

	var profile = REPO.users.findItem('id', id);
	profile.online = true;

	MAIN.session.authcookie(controller, sessionid, id, expiration);
	MAIN.session.refresh(id);

	FUNC.save('sessions');
	callback();
};

// Returns a user profile object
FUNC.profile = function(user, callback) {

	var meta = {};
	meta.openplatformid = MAIN.id;
	meta.version = MAIN.version;
	meta.name = user.name;
	meta.photo = user.photo;
	meta.locality = user.locality;
	meta.ou = user.ou;
	meta.company = user.company;
	meta.sa = user.sa;
	meta.apps = [];
	meta.countnotifications = user.countnotifications;
	meta.sounds = user.sounds;
	meta.statusid = user.statusid;
	meta.volume = user.volume;
	meta.darkmode = user.darkmode;
	meta.colorscheme = user.colorscheme || CONF.colorscheme;
	meta.timeformat = user.timeformat;
	meta.dateformat = user.dateformat;
	meta.numberformat = user.numberformat;
	meta.language = user.language;
	meta.desktop = user.desktop;
	meta.repo = user.repo;
	meta.rev = user.rev;
	meta.profileid = user.profileid;

	if (user.guest)
		meta.guest = true;

	meta.team = user.team ? user.team.length : 0;
	meta.member = user.member ? user.member.length : 0;

	var bg = user.background || CONF.background;
	if (bg)
		meta.background = bg;

	if (CONF.mode !== 'prod')
		meta.test = true;

	meta.mode = CONF.mode;
	meta.status = user.status;

	if (user.directory)
		meta.directory = user.directory;

	meta.directoryid = user.directoryid || 0;

	for (var i = 0; i < MAIN.apps.length; i++) {
		var app = MAIN.apps[i];
		var userapp = user.apps[app.id];
		if (app && !app.blocked && userapp)
			meta.apps.push({ id: app.id, favorite: userapp.favorite, icon: app.icon, title: app.titles ? (app.titles[user.language] || app.title) : app.title, name: app.name, online: app.online, version: app.version, linker: app.linker, notifications: userapp.notifications !== false, sounds: userapp.sounds !== false, responsive: app.responsive, countnotifications: userapp.countnotifications, countbadges: userapp.countbadges, width: app.width, height: app.height, screenshots: app.screenshots == true, resize: app.resize == true, type: app.type, mobilemenu: app.mobilemenu !== false, position: userapp.position == null ? app.position : userapp.position, color: app.color });
	}

	CONF.welcome && meta.apps.push({ id: '_welcome', icon: 'flag', title: TRANSLATOR(user.language, '@(Welcome)'), name: 'Welcome', online: true, internal: true, linker: CONF.welcome, width: 800, height: 600, resize: false, mobilemenu: false, position: 1000 });

	if (user.sa)
		meta.apps.push({ id: '_admin', icon: 'cog', title: TRANSLATOR(user.language, '@(Control panel)'), name: 'Admin', online: true, internal: true, linker: '_admin', width: 1280, height: 960, resize: true, mobilemenu: true, position: 1001 });

	callback(null, meta);
};

// Return user profile object
FUNC.profilelive = function(user) {

	var meta = {};

	meta.name = user.name;
	meta.photo = user.photo;
	meta.sa = user.sa;
	meta.apps = [];
	meta.countnotifications = user.countnotifications;
	meta.sounds = user.sounds;
	meta.statusid = user.statusid;
	meta.status = user.status;
	meta.volume = user.volume;
	meta.darkmode = user.darkmode;
	meta.desktop = user.desktop;
	meta.colorscheme = user.colorscheme || CONF.colorscheme;
	meta.repo = user.repo;
	meta.rev = user.rev;

	if (user.locking)
		meta.locking = user.locking;

	if (user.guest)
		meta.guest = true;

	var bg = user.background || CONF.background;
	if (bg)
		meta.background = bg;

	meta.mode = CONF.mode || 'test';

	if (user.status)
		meta.status = user.status;

	meta.apps = user.apps;
	return meta;
};

FUNC.reconfigure = function(callback) {
	DBMS().find('config').fields('id,type,value').data(function(response) {

		if (!response.length) {
			// First init
			REQUIRE('databases/init.js');
			setTimeout(callback => FUNC.reconfigure(callback), 2000, callback);
			return;
		}

		for (var i = 0; i < response.length; i++) {
			var item = response[i];
			var val = item.value;
			switch (item.type) {
				case 'number':
					val = +val;
					break;
				case 'boolean':
					val = val === '1' || val === 'true';
					break;
				case 'date':
					val = val.parseDate();
					break;
				case 'object':
					val = JSON.parse(val);
					break;
			}

			if (item.id === 'smtpsettings') {
				item.id = 'mail_smtp_options';
				val = val.parseJSON();
			} else if (item.id === 'smtp')
				item.id = 'mail_smtp';
			else if (item.id === 'sender')
				item.id = 'mail_address_from';

			CONF[item.id] = val;
		}

		CONF.mail_smtp && Mail.use(CONF.mail_smtp, CONF.mail_smtp_options, err => err && FUNC.log('Error/SMTP', null, CONF.mail_smtp + ': ' + err));
		CMD('refresh_tms');
		MAIN.id = CONF.url.crc32(true);
		callback && callback();
		EMIT('configure');
	});
};

// Output see the app only
FUNC.meta = function(app, user, serverside) {

	if (!user.apps || !user.apps[app.id])
		return null;

	var meta = { date: NOW, ip: user.ip, url: app.frame, id: app.id };
	var token = FUNC.encodeauthtoken(app, user);
	var tokenapp = FUNC.encodetoken(app, user);

	if (!serverside) {
		meta.accesstoken = token;
		meta.verify = CONF.url + '/api/verify/?accesstoken=' + token;
		meta.rev = user.rev;
	}

	if (serverside) {
		meta.openplatform = CONF.url;
		meta.openplatformid = MAIN.id;

		if (CONF.email)
			meta.email = CONF.email;

		if (CONF.verifytoken)
			meta.verifytoken = CONF.verifytoken;
	}

	meta.name = CONF.name;
	meta.version = MAIN.version;

	// meta.colorscheme = CONF.colorscheme;
	// meta.background = CONF.background;

	if (app.serververify && !serverside) {
		var tmp = FUNC.makeprofile(user, app.allowreadprofile, app);
		meta.serververify = true;
		meta.profile = {};
		meta.profile.badge = tmp.badge;
		meta.profile.notify = tmp.notify;
		return meta;
	}

	if (app.allowreadprofile) {
		meta.profile = FUNC.makeprofile(user, app.allowreadprofile, app);
	} else {
		meta.profile = {};
		meta.profile.id = user.id;
		meta.profile.name = user.name;
		meta.profile.dateformat = user.dateformat;
		meta.profile.timeformat = user.timeformat;
		meta.profile.numberformat = user.numberformat;
		meta.profile.language = user.language;
	}

	if (user.repo)
		meta.profile.repo = user.repo;

	if (serverside) {

		if (app.sn)
			meta.sn = app.sn;

		meta.meta = CONF.url + '/api/meta/?accesstoken=' + tokenapp;

		if (app.allowreadapps)
			meta.apps = CONF.url + '/api/apps/?accesstoken=' + tokenapp;

		if (app.allowreadusers)
			meta.users = CONF.url + '/api/users/?accesstoken=' + tokenapp;

		meta.services = CONF.url + '/api/services/?accesstoken=' + tokenapp;

		if (app.settings)
			meta.settings = app.settings;

		if (app.services)
			meta.servicetoken = app.servicetoken;
	}

	return meta;
};

FUNC.metaguest = function() {
	var meta = { date: NOW };
	meta.openplatform = CONF.url;
	meta.openplatformid = MAIN.id;
	meta.name = CONF.name;
	meta.guest = true;
	meta.id = '0';

	if (CONF.email)
		meta.email = CONF.email;

	if (CONF.verifytoken)
		meta.verifytoken = CONF.verifytoken;

	meta.colorscheme = CONF.colorscheme;
	meta.background = CONF.background;
	meta.profile = CLONE(MAIN.guest);
	meta.profile.apps = meta.profile.accesstoken = meta.profile.verifytoken = undefined;
	return meta;
};

// Notifications + badges
FUNC.encodetoken = function(app, user) {
	var sign = app.id + '-' + user.id + '-' + (user.accesstoken + app.accesstoken).crc32(true);
	return sign + '-' + (sign + CONF.accesstoken).crc32(true);
};

FUNC.decodetoken = function($, callback) {

	if (DDOS[$.ip] > DDOS_MAX_ATTEMPS) {
		$.invalid('error-blocked-ip');
		return;
	}

	var sign = $.query.accesstoken;
	if (!sign || sign.length < 30) {
		DDOS[$.ip] = (DDOS[$.ip] || 0) + 1;
		$.invalid('error-invalid-accesstoken');
		return;
	}

	if (SIMPLECACHE[sign]) {
		callback(SIMPLECACHE[sign]);
		return;
	}

	var arr = sign.split('-');
	if (arr.length !== 4) {
		DDOS[$.ip] = (DDOS[$.ip] || 0) + 1;
		$.invalid('error-invalid-accesstoken');
		return;
	}

	var tmp = (arr[0] + '-' + arr[1] + '-' + arr[2] + CONF.accesstoken).crc32(true) + '';
	if (tmp !== arr[3]) {
		DDOS[$.ip] = (DDOS[$.ip] || 0) + 1;
		$.invalid('error-invalid-accesstoken');
		return;
	}

	var app = MAIN.apps.findItem('id', arr[0]);
	var user = USERS[arr[1]];

	if (!app) {
		DDOS[$.ip] = (DDOS[$.ip] || 0) + 1;
		$.model = { url: $.req.url, headers: $.req.headers };
		FUNC.log('Error/Token', arr[0], 'FUNC.decodetoken:app==null', $);
		$.invalid('error-invalid-accesstoken');
		return;
	}

	if (user) {
		var tmp = (user.accesstoken + app.accesstoken).crc32(true) + '';
		if (tmp === arr[2]) {
			var obj = { app: app, user: user };
			if (FUNC.unauthorized(obj, $)) {
				DDOS[$.ip] = (DDOS[$.ip] || 0) + 1;
			} else {
				SIMPLECACHE[sign] = obj;
				callback(obj);
			}
		} else {
			DDOS[$.ip] = (DDOS[$.ip] || 0) + 1;
			$.invalid('error-invalid-accesstoken');
		}
	} else {
		// reads user from DB
		readuser(arr[1], function(err, user) {
			if (user) {
				var tmp = (user.accesstoken + app.accesstoken).crc32(true) + '';
				if (tmp === arr[2]) {
					var obj = { app: app, user: user };
					if (FUNC.unauthorized(obj, $)) {
						DDOS[$.ip] = (DDOS[$.ip] || 0) + 1;
					} else {
						SIMPLECACHE[sign] = obj;
						callback(obj);
					}
				} else {
					$.invalid('error-invalid-accesstoken');
					DDOS[$.ip] = (DDOS[$.ip] || 0) + 1;
				}
			} else {
				DDOS[$.ip] = (DDOS[$.ip] || 0) + 1;
				$.invalid('error-invalid-accesstoken');
			}
		});
	}
};

function checkorigin(origins, ip) {

	for (var i = 0; i < origins.length; i++) {
		var o = origins[i];
		if (ip.substring(0, o.length) === o)
			return i;
	}

	return -1;
}

FUNC.unauthorized = function(obj, $) {
	var app = obj.app;
	var user = obj.user;

	if (app.origintoken) {
		var token = $.headers['x-origin'];
		if (token !== app.origintoken) {
			$.invalid('error-invalid-origin');
			if (!ORIGINERRORS[$.ip]) {
				FUNC.log('Error/Origin', null, app.name + ':' + app.origintoken + ' != ' + token);
				ORIGINERRORS[$.ip] = 1;
			}
			return true;
		}
	} else if (app.origin && app.origin.length) {
		if (checkorigin(app.origin, $.ip) == -1 && app.hostname !== $.ip && (!$.user || $.user.id !== user.id)) {
			if (!ORIGINERRORS[$.ip]) {
				FUNC.log('Error/Origin', null, app.name + ':' + app.hostname + ' != ' + $.ip);
				ORIGINERRORS[$.ip] = 1;
			}
			$.invalid('error-invalid-origin');
			return true;
		}
	} else if (app.hostname !== $.ip && (!$.user || $.user.id !== user.id)) {
		if (!ORIGINERRORS[$.ip]) {
			FUNC.log('Error/Origin', null, app.name + ':' + app.hostname + ' != ' + $.ip);
			ORIGINERRORS[$.ip] = 1;
		}
		$.invalid('error-invalid-origin');
		return true;
	}

	if (user.blocked || user.inactive) {
		$.invalid('error-accessible');
		return true;
	}
};

FUNC.notadmin = function($) {
	if ($.user && !$.user.sa) {
		$.invalid('error-permissions');
		return true;
	}
};

// Auth token
FUNC.encodeauthtoken = function(app, user) {
	var sign = app.id + '-' + user.sessionid;
	sign += '-' + ((user.accesstoken + app.accesstoken).crc32(true) + '' + (app.id + user.sessionid + user.verifytoken + CONF.accesstoken).crc32(true));
	return sign.encrypt(CONF.accesstoken.substring(0, 20));
};

FUNC.decodeauthtoken = function($, callback) {

	if (DDOS[$.ip] > DDOS_MAX_ATTEMPS) {
		$.invalid('error-blocked-ip');
		return;
	}

	var sign = $.query.accesstoken;

	if (!sign || sign.length < 30) {
		DDOS[$.ip] = (DDOS[$.ip] || 0) + 1;
		$.invalid('error-invalid-accesstoken');
		return;
	}

	if (SIMPLECACHE[sign]) {
		callback(SIMPLECACHE[sign]);
		return;
	}

	sign = sign.decrypt(CONF.accesstoken.substring(0, 20));

	if (!sign) {
		DDOS[$.ip] = (DDOS[$.ip] || 0) + 1;
		$.invalid('error-invalid-accesstoken');
		return;
	}

	var arr = sign.split('-');
	if (arr.length !== 3)
		return null;

	var app = MAIN.apps.findItem('id', arr[0]);

	if (!app) {
		DDOS[$.ip] = (DDOS[$.ip] || 0) + 1;
		$.invalid('error-invalid-accesstoken');
		return;
	}

	// reads user from DB
	readusersession(arr[1], function(err, user) {
		if (user) {
			var tmp = (user.accesstoken + app.accesstoken).crc32(true) + '' + (app.id + arr[1] + user.verifytoken + CONF.accesstoken).crc32(true);
			if (tmp === arr[2]) {
				var obj = { app: app, user: user };
				if (FUNC.unauthorized(obj, $)) {
					DDOS[$.ip] = (DDOS[$.ip] || 0) + 1;
				} else {
					SIMPLECACHE[sign] = obj;
					callback(obj);
				}
			} else {
				DDOS[$.ip] = (DDOS[$.ip] || 0) + 1;
				$.invalid('error-invalid-accesstoken');
			}
		} else {
			DDOS[$.ip] = (DDOS[$.ip] || 0) + 1;
			$.invalid('error-invalid-accesstoken');
		}
	}, true);
};

FUNC.makeapp = function(app, type) {

	// type 1: basic info
	// type 2: all info

	var obj = {};
	obj.id = app.id;
	obj.title = app.title;
	obj.allowreadapps = app.allowreadapps;
	obj.allowreadusers = app.allowreadusers;
	obj.allowreadmeta = app.allowreadmeta;
	obj.allownotifications = app.allownotifications;
	obj.responsive = app.responsive;
	obj.icon = app.icon;
	obj.color = app.color;
	obj.description = app.description;
	obj.name = app.name;
	obj.title = app.title;
	obj.version = app.version;
	obj.online = app.online;
	obj.dtsync = app.dtsync;
	obj.dtcreated = app.dtcreated;
	obj.author = app.author;
	obj.type = app.type;
	obj.mobilemenu = app.mobilemenu;
	obj.services = app.services ? Object.keys(app.services) : [];

	switch (type) {
		case 2:
			obj.url = app.url;
			obj.frame = app.frame;
			obj.roles = app.roles;
			obj.email = app.email;
			obj.custom = app.custom;
			obj.origin = app.origin;
			break;
	}

	return obj;
};

FUNC.makeprofile = function(user, type, app, fields) {

	// type 1: basic info
	// type 2: all info
	// type 3: app users - basic info
	// type 4: app users - all info

	// if (type > 2 && (!user.apps || !user.apps[app.id]) || user.inactive)
	if (type > 2 && user.inactive)
		return;

	var obj = {};

	if (!fields || fields.id)
		obj.id = user.id;

	if (!fields || fields.oauth2)
		obj.oauth2 = user.oauth2;

	if (user.supervisorid && (!fields || fields.supervisorid))
		obj.supervisorid = user.supervisorid;

	if (user.deputyid && (!fields || fields.deputyid))
		obj.deputyid = user.deputyid;

	if (!fields || fields.directory) {
		if (user.directory) {
			obj.directory = user.directory;
			obj.directoryid = user.directoryid;
		} else
			obj.directoryid = 0;
	}

	if (!fields || fields.statusid)
		obj.statusid = user.statusid;

	if (user.status && (!fields || fields.status))
		obj.status = user.status;

	if (user.blocked && (!fields || fields.blocked))
		obj.blocked = user.blocked;

	if (user.company && (!fields || fields.company))
		obj.company = user.company;

	if (user.groupid && (!fields || fields.groupid))
		obj.groupid = user.groupid;

	if (user.dtbirth && (!fields || fields.dtbirth))
		obj.dtbirth = user.dtbirth;

	if (user.dtcreated && (!fields || fields.dtcreated))
		obj.dtcreated = user.dtcreated;

	if (user.dtend && (!fields || fields.dtend))
		obj.dtend = user.dtend;

	if (user.dtbeg && (!fields || fields.dtbeg))
		obj.dtbeg = user.dtbeg;

	if (user.dtupdated && (!fields || fields.dtupdated))
		obj.dtupdated = user.dtupdated;

	if (user.firstname && (!fields || fields.firstname))
		obj.firstname = user.firstname;

	if (user.lastname && (!fields || fields.lastname))
		obj.lastname = user.lastname;

	if (user.middlename && (!fields || fields.middlename))
		obj.middlename = user.middlename;

	if (user.name && (!fields || fields.name))
		obj.name = user.name;

	if (user.gender && (!fields || fields.gender))
		obj.gender = user.gender;

	if (user.language && (!fields || fields.language))
		obj.language = user.language;

	if (user.position && (!fields || fields.position))
		obj.position = user.position;

	if (user.meta && (!fields || fields.meta))
		obj.meta = user.meta;

	if (user.customer && (!fields || fields.customer))
		obj.customer = user.customer;

	if (!fields || fields.notifications)
		obj.notifications = user.notifications;

	if (!fields || fields.online)
		obj.online = user.online;

	if (user.photo && (!fields || fields.photo))
		obj.photo = CONF.url + '/photos/' + user.photo;

	if (user.locality && (!fields || fields.locality))
		obj.locality = user.locality;

	if (user.ou && (!fields || fields.ou))
		obj.ou = user.ou instanceof Array ? user.ou.join('/') : user.ou;

	if (user.dn && (!fields || fields.dn))
		obj.dn = user.dn;

	if (user.reference && (!fields || fields.locality))
		obj.reference = user.reference;

	if (user.dateformat && (!fields || fields.dateformat))
		obj.dateformat = user.dateformat;

	if (user.numberformat && (!fields || fields.numberformat))
		obj.numberformat = user.numberformat;

	if (user.timeformat && (!fields || fields.timeformat))
		obj.timeformat = user.timeformat;

	if (!fields || fields.countnotifications)
		obj.countnotifications = user.countnotifications || 0;

	if (!fields || fields.countbadges)
		obj.countbadges = user.countbadges || 0;

	if (!fields || fields.colorscheme)
		obj.colorscheme = user.colorscheme || CONF.colorscheme;

	if (!fields || fields.background)
		obj.background = user.background || CONF.background;

	if (!fields || fields.darkmode)
		obj.darkmode = user.darkmode;

	if (obj.background && (!fields || fields.background))
		obj.background = CONF.url + '/backgrounds/' + obj.background;

	if (!fields || fields.team)
		obj.team = user.team;

	if (!fields || fields.member)
		obj.member = user.member;

	if (!fields || fields.roles) {
		if (user.roles)
			obj.roles = user.roles;
		else
			obj.roles = user.apps && user.apps[app.id] ? user.apps[app.id].roles : EMPTYARRAY;
	}

	if (!fields || fields.groups)
		obj.groups = user.groups;

	if (user.sa && (!fields || fields.sa))
		obj.sa = user.sa;

	if (!fields || fields.sounds)
		obj.sounds = user.sounds;

	if (!fields || fields.volume)
		obj.volume = user.volume;

	var token;

	if (!fields || fields.badge || (obj.notifications && fields.notify))
		token = FUNC.encodetoken(app, user);

	if (!fields || fields.badge)
		obj.badge = CONF.url + '/api/badge/?accesstoken=' + token;

	if (obj.notifications && (!fields || fields.notify))
		obj.notify = CONF.url + '/api/notify/?accesstoken=' + token;

	if (type === 2 || type === 4) {
		if (!fields || fields.email)
			obj.email = user.email;

		if (!fields || fields.phone)
			obj.phone = user.phone;
	}

	return obj;
};

DEF.helpers.profile = function() {
	return JSON.stringify(FUNC.makeprofile(this.user, 1));
};

function getCleanValue(a, b, c) {
	if (a != null)
		return a;
	if (b != null)
		return b;
	return c;
}

FUNC.refreshapp = function(app, callback) {
	var checksum = app.checksum || '';
	RESTBuilder.GET(app.url).exec(function(err, response, output) {

		if (err || !response.url) {

			app.online = false;
			app.checksum = '';

		} else {

			var meta = CONVERT(response, 'name:String(30),description:String(100),color:String(8),icon:String(30),url:String(500),author:String(50),type:String(30),version:String(20),email:String(120),width:Number,height:Number,resize:Boolean,mobilemenu:Boolean,serververify:Boolean,reference:String(40),roles:[String],origin:[String],allowguestuser:Boolean,guestuser:Boolean,responsive:boolean');

			app.hostname = output.hostname.replace(/:\d+/, '');
			app.online = true;
			app.version = meta.version;
			app.name = meta.name;
			app.description = meta.description;
			app.author = meta.author;
			app.icon = meta.icon;
			app.frame = meta.url;
			app.email = meta.email;
			app.roles = meta.roles;
			app.color = meta.color;
			app.width = meta.width;
			app.height = meta.height;
			app.resize = meta.resize;
			app.type = meta.type;
			app.responsive = meta.responsive;
			app.mobilemenu = meta.mobilemenu;
			app.serververify = meta.serververify !== false;
			app.services = response.services || null;
			app.reference = meta.reference;
			app.allowguestuser = getCleanValue(meta.allowguestuser, meta.guestuser, false);

			if (!app.icon)
				app.icon = 'rocket';

			if (app.icon.indexOf('fa-') === -1)
				app.icon = 'fa-' + app.icon + (app.icon.indexOf(' ') === -1 ? ' fa' : '');

			if (meta.origin && meta.origin instanceof Array && meta.origin.length)
				app.origin = meta.origin;
			else
				app.origin = null;

			// Adds resolved origin
			// Only Total.js 4
			if (output.origin && output.origin.length) {

				if (!app.origin)
					app.origin = [];

				for (var i = 0; i < output.origin.length; i++) {
					var origin = output.origin[i];
					if (app.origin.indexOf(origin) === -1)
						app.origin.push(origin);
				}
			}

			var sign = (app.name + '' + app.icon + app.version + (app.color ? app.color : '') + (app.width || 0) + '' + (app.height || 0) + (app.resize ? '1' : '0') + app.type + (app.responsive ? '1' : '0') + (app.mobilemenu ? '1' : '0') + (app.serververify ? '1' : '0') + (app.allowreadapps ? '1' : '0') + (app.allowreadusers ? '1' : '0') + (app.allowreadprofile ? '1' : '0') + (app.allownotifications ? '1' : '0') + (app.allowreadmeta ? '1' : '0') + (app.origin ? (app.origin.join('') || '[]') : '[]') + (app.roles ? (app.roles.join('') || '[]') : '[]') + app.hostname + (app.services ? JSON.stringify(app.services) : '{}'));
			app.checksum = sign.crc32(true) + '';
		}

		app.dtsync = NOW;
		callback(err, app, checksum !== app.checksum);
	});
};

// Refreshes a guest apps
FUNC.refreshguest = function() {
	if (MAIN.guest) {
		MAIN.guest.apps = {};
		for (var i = 0; i < MAIN.apps.length; i++) {
			var app = MAIN.apps[i];
			if (app.guest && !app.blocked)
				MAIN.guest.apps[app.id] = { roles: [], countnotifications: 0, countbadges: 0 };
		}
	}
};

// Loads a guest info from the file
FUNC.loadguest = function(callback) {

	Fs.readFile(PATH.root('guest.json'), function(err, data) {

		if (err) {
			callback && callback();
			return;
		}

		var user = data.toString('utf8').parseJSON(true);
		if (user) {
			user.id = '0';
			user.verifytoken = '0';
			user.accesstoken = '0';
			user.sounds = true;
			user.dtcreated = new Date(2019, 5, 17, 23, 15, 0);
			user.dtupdated = null;
			user.dtlogged = NOW;
			user.online = true;
			user.guest = true;
			user.apps = {};

			delete user.sa;
			delete user.countnotifications;
			delete user.supervisorid;
			delete user.deputyid;
			delete user.ou;
			delete user.dn;
			delete user.ougroups;

			if (!user.company)
				user.company = undefined;

			if (!user.reference)
				user.reference = undefined;

			if (!user.dateformat)
				user.dateformat = 'yyyy-MM-dd';

			if (!user.timeformat)
				user.timeformat = 24;

			if (!user.numberformat)
				user.numberformat = 1;

			MAIN.guest = user;
			FUNC.refreshguest();
			callback && callback();
		}
	});
};

FUNC.refreshgroupsrolesdelay = function() {
	setTimeout2('refreshgroupsrolesdelay', FUNC.refreshgroupsroles, 2000);
};

// Repairs empty groups
FUNC.repairgroupsroles = function(callback) {
	REPO.users.wait(function(item, next) {

		if (item.groupshash) {
			next();
			return;
		}

		var arr = item.groups.slice(0);
		arr.sort();

		var groupshash = arr.join(',').crc32(true) + '';
		if (groupshash) {
			item.groupshash = groupshash === '0' ? '' : groupshash;
			next();
		} else
			next();

	}, callback);
};

FUNC.refreshgroupsroles = function(callback) {

	MAIN.groupscache = {};
	MAIN.rolescache = {};
	MAIN.groups = [];
	MAIN.roles = [];
	MAIN.meta.groups = [];

	for (var i = 0; i < REPO.groups.length; i++) {
		var item = REPO.groups[i];
		var obj = { id: item.id, name: item.name, note: item.note, dtcreated: item.dtcreated, dtupdated: item.dtupdated, apps: [], appsroles: {} };
		MAIN.groupscache[item.id] = obj;
		MAIN.groups.push(obj);
		MAIN.meta.groups.push({ id: item.id, name: item.name });
	}

	for (var i = 0; i < MAIN.groups.length; i++) {
		var group = MAIN.groups[i];
		for (var j = 0; j < REPO.groups_apps.length; j++) {
			var ga = REPO.groups_apps[j];
			if (ga.groupid === group.id) {
				group.appsroles[ga.appid] = ga.roles;
				group.apps.push(ga.appid);
			}
		}
	}

	for (var i = 0; i < REPO.roles.length; i++) {
		var item = REPO.roles[i];
		var obj = { id: item.id, name: item.name };
		MAIN.roles.push(obj);
		MAIN.rolescache[item.id] = obj;
	}

	// Clean apps
	REPO.users.wait(function(item, next) {

		item.groups = item.groups.remove(name => MAIN.groupscache[name] == null);

		if (item.groups)
			item.groups.sort();
		else
			item.groups = [];

		var groupshash = item.groups.join(',').crc32(true) + '';
		if (groupshash == '0') {
			item.apps = item.apps ? item.apps.remove(app => app.inherited === true) : [];
			item.groupshash = '';
			item.groups = [];
			next();
			return;
		}

		var appskeys = {};

		for (var i = 0; i < item.groups.length; i++) {
			var g = item.groups[i];
			var group = MAIN.groupscache[g];
			if (group) {
				for (var j = 0; j < group.apps.length; j++)
					appskeys[group.apps[j]] = 1;
			}
		}

		var apps = Object.keys(appskeys);
		var appsid = [];

		for (var i = 0; i < apps.length; i++)
			appsid.push(apps[i]);

		REPO.users_apps = REPO.users_apps.remove(m => m.inherited && m.userid === item.id && m.groupshash == groupshash && appsid.indexOf(m.appid) === -1);

		for (var i = 0; i < appsid.length; i++) {

			var appid = apps[i];
			var app = MAIN.apps.findItem('id', appid);
			if (app == null) {
				console.log('Error: APP NOT FOUND - ' + appid);
				continue;
			}

			// Reads app roles
			var roles = {};
			for (var j = 0; j < item.groups.length; j++) {
				var group = MAIN.groupscache[item.groups[j]];
				var appsroles = group ? group.appsroles[appid] : null;
				if (appsroles) {
					for (var k = 0; k < appsroles.length; k++) {
						if (MAIN.rolescache[appsroles[k]])
							roles[appsroles[k]] = 1;
					}
				}
			}

			roles = Object.keys(roles);

			item.groupshash = groupshash === '0' ? '' : groupshash;
			var id = item.id + appid;
			var userapp = REPO.users_apps.findItem('id', id);
			if (userapp) {
				if (userapp.inherited)
					userapp.roles = roles;
			} else
				REPO.users_apps.push({ id: id, userid: item.id, appid: app.id, roles: roles, inherited: true, notifications: true, countnotifications: 0, countbadges: 0, countopen: 0, position: app.position, groupshash: groupshash });
		}

		next();

	}, function() {

		// Releases all sessions
		if (MAIN.session)
			MAIN.session.sessions = {};

		FUNC.save('users', 'users_apps');
		callback && callback();
	});
};

FUNC.refreshapps = function(callback) {
	MAIN.apps = REPO.apps;
	callback && callback();
};

FUNC.refreshmeta = function(callback, directory) {

	if (directory)
		return;

	var prepare = function(obj) {
		if (obj instanceof Array)
			return obj;
		var arr = [];
		for (var k in obj)
			arr.push({ id: k, name: k });
	};

	var tmp = {};
	tmp.localities = {};
	tmp.positions = {};
	tmp.directories = {};
	tmp.groups = {};
	tmp.languages = {};
	tmp.ou = {};

	for (var i = 0; i < REPO.users.length; i++) {

		var item = REPO.users[i];
		var locality = item.locality;
		var ou = item.ou ? item.ou.join('/') : '';
		var language = item.language;
		var position = item.position;
		var directory = item.directory;

		if (locality && !tmp.localities[locality])
			tmp.localities[locality] = 1;

		if (ou && !tmp.ou[ou])
			tmp.ou[ou] = 1;

		if (language && !tmp.languages[language])
			tmp.languages[language] = 1;

		if (position && !tmp.positions[position])
			tmp.positions[position] = 1;

		if (directory && !tmp.directories[directory])
			tmp.directories[directory] = 1;
	}

	var meta = {};
	meta.localities = prepare(tmp.localities);
	meta.positions = prepare(tmp.positions);
	meta.directories = prepare(tmp.directories);
	meta.languages = prepare(tmp.languages);
	meta.ou = tmp.ou;
	meta.groups = [];

	for (var i = 0; i < REPO.groups.length; i++) {
		var tmp = REPO.groups[i];
		meta.groups.push({ id: tmp.id, name: tmp.name });
	}

	meta.roles = [];
	for (var i = 0; i < REPO.roles.length; i++) {
		var tmp = REPO.roles[i];
		meta.roles.push({ id: tmp.id, name: tmp.name });
	}

	MAIN.metadirectories = {};
	MAIN.meta = meta;
	callback && callback(null, meta);
};

FUNC.refreshappsroles = function() {
	setTimeout2('updaterolesdelay', FUNC.updateroles, 100);
};

FUNC.refreshmetadelay = function() {
	setTimeout2('refreshmetadelay', FUNC.refreshmeta, 100);
};

FUNC.init = function(callback) {

	var pending = ['users', 'groups', 'groups_apps', 'users_apps', 'oauth', 'sessions', 'apps'];

	pending.wait(function(name, next) {
		Fs.readFile(PATH.databases(name + '.json'), function(err, data) {
			if (data) {
				var obj = data.toString('utf8').parseJSON(true);
				for (var m in obj)
					REPO[name][m] = obj[m];
			}
			next();
		});

	}, function() {

		for (var i = 0; i < REPO.users.length; i++)
			REPO.users[i].online = false;

		for (var i = 0; i < REPO.sessions.length; i++)
			REPO.sessions[i].online = false;

		REPO.sessions = REPO.sessions.remove(session => session.dtexpire < NOW);
		FUNC.refreshmeta();
		FUNC.refreshapps();
		callback && callback();
	});

};

function checkuser(next) {
	if (REPO.users.length) {
		next();
	} else {
		var model = {};
		model.firstname = 'Total';
		model.lastname = 'Admin';
		model.email = 'info@totaljs.com';
		model.login = 'admin';
		model.password = 'admin';
		model.gender = 'male';
		model.sa = true;
		model.desktop = 3;
		model.notifications = true;
		model.notificationsemail = true;
		model.notificationsphone = true;
		model.dateformat = 'yyyy-MM-dd';
		model.timeformat = 24;
		model.volume = 50;
		model.sounds = true;
		model.colorscheme = '#4285f4';
		model.language = 'en';
		model.dtbeg = NOW;
		$INSERT('Users', model, next);
	}
}

// Load
PAUSESERVER('initialization');
ON('ready', function() {
	$WORKFLOW('Settings', 'init', function() {

		// Set all users to offline
		for (var i = 0; i < REPO.users.length; i++)
			REPO.users[i].online = false;

		FUNC.init(function() {
			FUNC.refreshapps(function() {
				FUNC.refreshgroupsroles(function() {
					checkuser(function() {
						FUNC.loadguest(function() {
							PAUSESERVER('initialization');
							refresh_apps();
							EMIT('loaded');
						});
					});
				});
			});
		});
	});
});

function readusersession(id, callback) {
	var session = REPO.sessions.findItem('id', id);
	if (session && session.dtexpire > NOW)
		readuser(session.userid, callback);
	else
		callback('error-users-404');
}

// Reads a user
function readuser(id, callback) {

	var user = REPO.users.findItem('id', id);

	if (!user || user.inactive || user.blocked) {
		callback('error-users-404');
		return;
	}

	user = CLONE(user);

	if (CONF.allowmembers) {
		user.team = [];
		user.member = [];

		for (var i = 0; i < REPO.members.length; i++) {
			var item = REPO.members[i];
			if (item.email === user.email)
				user.team.push(item.userid);
			else if (item.userid === user.id) {
				var member = REPO.users.findItem('email', item.email);
				member && user.member.push(member.id);
			}
		}

		if (!user.team.length)
			delete user.team;

		if (!user.member.length)
			delete user.member;
	}

	user.apps = REPO.users_apps.findAll('userid', user.id);

	if (!user.colorscheme)
		user.colorscheme = CONF.colorscheme || '#4285f4';

	var apps = {};
	for (var i = 0; i < user.apps.length; i++) {
		var app = CLONE(user.apps[i]);
		if (!app.roles)
			app.roles = EMPTYARRAY;
		app.id = app.appid;
		apps[app.appid] = app;
	}

	user.apps = apps;
	user.welcome = !user.dtlogged;
	user.ticks = NOW.getTime();
	callback(null, user);
}

var save_pending = {};
var save = function(type) {
	delete save_pending[type];
	REPO[type] && Fs.writeFile(PATH.databases(type + '.json'), JSON.stringify(REPO[type]), NOOP);
};

FUNC.save = function() {
	for (var i = 0; i < arguments.length; i++) {
		var type = arguments[i];
		if (save_pending[type]) {
			if (save_pending[type]++ > 8)
				return;
			clearTimeout(save_pending[type].timeout);
		}
		save_pending[type] = { count: 1, timeout: setTimeout(save, 10000, type) };
	}
};

FUNC.updateroles = function(callback) {

	var roles = {};
	var is = false;

	for (var i = 0; i < REPO.apps.length; i++) {
		var app = REPO.apps[i];
		if (app.roles) {
			for (var j = 0; j < app.roles.length; j++)
				roles[app.roles[j]] = 1;
		}
	}

	var tmp = [];

	for (var m in roles)
		tmp.push({ id: m, name: m });

	var diff = DIFFARR('id', REPO.roles, tmp);

	for (var i = 0; i < diff.add.length; i++) {
		REPO.roles.push(diff.add[i]);
		EMIT('roles.create', diff.add[i]);
		store = true;
	}

	is = diff.add.length > 0 || diff.rem.length > 0;

	for (var i = 0; i < diff.rem.length; i++) {
		var index = REPO.roles.indexOf(diff.rem[i]);
		if (index !== -1) {
			REPO.roles.splice(index, 1);
			EMIT('roles.remove', diff.rem[i]);
		}
	}

	if (is)
		FUNC.refreshgroupsroles(() => FUNC.refreshmeta(callback));
	else if (callback)
		callback();
};

function stringifyprepare(key, value) {
	if (key !== 'password' && value != null)
		return value;
}

FUNC.log = function(type, rowid, message, $) {

	var obj = {};
	obj.type = type;

	if (rowid)
		obj.rowid = rowid.max(50);

	obj.message = (message || '').max(200);
	obj.dtcreated = NOW = new Date();

	if ($) {

		if ($.model && $.model !== EMPTYOBJECT)
			obj.data = JSON.stringify($.model, stringifyprepare);

		obj.ip = $.ip;

		if ($.user) {
			obj.ua = $.user.ua;
			obj.userid = $.user.id;
			obj.username = $.user.name;
		} else if ($.headers)
			obj.ua = $.ua || ($.headers['user-agent'] || '').toString(30);

	}

	DBMS().insert('logs', obj);
};

function refresh_apps(callback) {
	MAIN.apps.wait(function(app, next) {
		FUNC.refreshapp(app, function(err, item) {
			EMIT('apps.sync', item.id);
			next();
		});
	}, () => FUNC.updateroles(callback));
}

FUNC.refreshappsmeta = refresh_apps;

function emailnotifications() {

	var is = false;
	var messages = [];

	REPO.users.wait(function(user, next) {

		if (!user.countnotifications || user.dtnotified || user.inactive || user.blocked) {
			next();
			return;
		}

		user.dtnotified = NOW;
		user.countnotifications = 0;
		is = true;

		DBMS().find('notifications').take(20).where('unread', true).where('userid', user.id).sort('dtcreated_desc').callback(function(err, response) {

			if (!response.length) {
				next();
				return;
			}

			var model = {};
			model.user = user;
			model.messages = [];

			for (var j = 0; j < response.length; j++) {
				var item = response[j];
				model.messages.push(item.body.replace(/\n|\t|_{1,}|\*{1,}/g, ''));
			}

			var msg = Mail.create(TRANSLATOR(user.language, '@(Unread notifications)'), VIEW('mails/notifications', model, null, null, user.language));
			msg.to(user.email);
			msg.from(CONF.mail_from || CONF.mail_address_from, CONF.name);
			messages.push(msg);

			next();
		});

	}, function() {
		messages.length && Mail.send2(messages, ERROR('emailnotifications'));
		is && FUNC.save('users');
	});
}

var usage_online_cache = 0;
var usage_online_date = NOW.getDate();
var usage_online = function(count) {
	var day = NOW.getDate();
	if (count !== usage_online_cache || usage_online_date !== day) {
		usage_online_date = day;
		usage_online_cache = count;
		var id = NOW.format('yyyyMMdd');
		DBMS().modify('stats', { online: usage_online_cache, '>maxonline': usage_online_cache }, true).id(id).insert(usage_logged_insert);
	}
};

ON('service', function(counter) {

	if (counter % 10 === 0) {
		refresh_apps();
		USERS = {}; // clears cache
		DDOS = {};
		ORIGINERRORS = {};
	}

	if (counter % 5 === 0 && CONF.allownotifications)
		emailnotifications();

	if (OTPCOUNT) {
		var keys = Object.keys(OTP);
		for (var i = 0; i < keys.length; i++) {
			var otp = OTP[keys[i]];
			if (otp.date < NOW) {
				delete OTP[keys[i]];
				OTPCOUNT--;
			}
		}
	}

	var count = 0;

	for (var i = 0; i < REPO.sessions.length; i++) {
		var session = REPO.sessions[i];
		if (session.online)
			count++;
	}

	usage_online(count);
	SIMPLECACHE = {};
});

var usage_logged_insert = function(doc) {
	doc.id = NOW.format('yyyyMMdd');
	doc.date = NOW;
};

var usage_browser_insert = function(doc, params) {
	doc.id = params.id;
	doc.name = params.name.max(50);
	doc.date = NOW;
	doc.mobile = params.mobile;
};

FUNC.usage_logged = function(user) {

	var model = {};
	var model_browser = {};
	var id = NOW.format('yyyyMMdd');

	switch (user.desktop) {
		case 1:
			model['+windowed'] = model_browser['+windowed'] = 1;
			break;
		case 2:
			model['+tabbed'] = model_browser['+tabbed'] = 1;
			break;
		case 3:
			model['+portal'] = model_browser['+portal'] = 1;
			break;
	}

	model['+logged'] = 1;

	if (user.mobile)
		model['+mobile'] = 1;
	else
		model['+desktop'] = 1;

	if (user.darkmode)
		model['+darkmode'] = model_browser['+darkmode'] = 1;
	else
		model['+lightmode'] = model_browser['+lightmode'] = 1;

	var db = DBMS();
	model.dtupdated = model_browser.dtupdated = NOW;
	db.modify('stats', model, true).id(id).insert(usage_logged_insert);

	var browserid = id + user.ua.hash(true).toString(16);
	model_browser['+count'] = 1;
	db.modify('stats_browser', model_browser, true).id(browserid).insert(usage_browser_insert, { name: user.ua, id: browserid, mobile: user.mobile });
};

FUNC.uploaddir = function(type) {
	var path = CONF.upload ? Path.join(CONF.upload, type) : PATH.public(type);
	return path;
};

// UPDATE([4400, 4500, 4600, 4700, 4800, 4900], ERROR('Update'), 'updates');