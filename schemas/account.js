const Fs = require('fs');
var DDOS = {};

NEWSCHEMA('Account', function(schema) {

	schema.encrypt && schema.encrypt();
	schema.compress && schema.compress();

	schema.define('email', 'Email', true);
	schema.define('notifications', Boolean);
	schema.define('notificationsemail', Boolean);
	schema.define('notificationsphone', Boolean);
	schema.define('password', 'String(100)');
	schema.define('name', 'String(50)');
	schema.define('status', 'String(70)');
	schema.define('phone', 'Phone');
	schema.define('photo', 'String(50)');
	schema.define('sounds', Boolean);
	schema.define('darkmode', Boolean);
	schema.define('dateformat', ['yyyy-MM-dd', 'dd.MM.yyyy', 'MM.dd.yyyy']); // date format
	schema.define('timeformat', [12, 24]); // 12 or 24
	schema.define('numberformat', [1, 2, 3, 4]); // 1: "1 000.10", 2: "1 000,10", 3: "100,000.00", 4: "100.000,00"
	schema.define('volume', Number);
	schema.define('desktop', [1, 2, 3]);
	schema.define('otp', Boolean);
	schema.define('otpsecret', 'String(80)');
	schema.define('language', 'Lower(2)');
	schema.define('pin', 'String(4)'); // Unlock pin
	schema.define('locking', Number); // in minutes (0: disabled)
	schema.define('colorscheme', 'Lower(7)');
	schema.define('background', 'String(150)');

	// TMS
	schema.jsonschema_define('id', 'String');
	schema.jsonschema_define('userid', 'String');
	schema.jsonschema_define('ua', 'String');
	schema.jsonschema_define('ip', 'String');
	schema.jsonschema_define('dtcreated', 'Date');
	schema.jsonschema_define('dtupdated', 'Date');
	schema.jsonschema_define('dttms', 'Date');

	schema.setRead(function($) {

		if ($.user.guest) {
			$.invalid('error-permissions');
			return;
		}

		var user = $.user;
		var data = {};
		data.name = user.name;
		data.status = user.status;
		data.email = user.email;
		data.notifications = user.notifications;
		data.notificationsemail = user.notificationsemail;
		data.notificationsphone = user.notificationsphone;
		data.phone = user.phone;
		data.photo = user.photo;
		data.darkmode = user.darkmode;
		data.sounds = user.sounds;
		data.volume = user.volume;
		data.language = user.language;
		data.colorscheme = user.colorscheme;
		data.desktop = user.desktop;
		data.background = user.background;
		data.otp = user.otp;
		data.locking = user.locking;
		data.dateformat = user.dateformat;
		data.timeformat = user.timeformat;
		data.numberformat = user.numberformat;
		data.checksum = user.checksum;
		$.extend && $.extend(data);
		$.callback(data);
	});

	schema.addWorkflow('check', function($, model) {

		if ($.user.guest) {
			$.invalid('error-permissions');
			return;
		}

		if (!$.model.email) {
			$.success();
			return;
		}

		for (var i = 0; i < REPO.users.length; i++) {
			var item = REPO.users[i];
			if (item.email === model.email && item.id !== $.user.id) {
				$.invalid('error-users-email');
				return;
			}
		}

		$.success();
	});

	schema.setSave(function($, model) {

		if ($.user.guest) {
			$.invalid('error-permissions');
			return;
		}

		var user = $.user;
		var path;

		// Removing older background
		if (user.background && user.background !== CONF.background && model.background !== user.background) {
			path = 'backgrounds/' + user.background;
			Fs.unlink(PATH.public(path), NOOP);
			TOUCH('/' + path);
			user.background = model.background;
		}

		var isoauth = $.user.checksum === 'oauth2';
		var isldap = !!$.user.dn;
		var ref = REPO.users.findItem('id', user.id);

		if (CONF.allownickname && model.name && !isoauth) {
			var name = FUNC.nicknamesanitize(model.name);
			if (name) {
				user.name = model.name = name;
				modified = true;
			} else
				model.name = undefined;
		} else
			model.name = undefined;

		if (!isoauth && !isldap && model.password && !model.password.startsWith('***')) {
			user.password = model.password = model.password.hash(CONF.hashmode || 'sha256', CONF.hashsalt);
			model.dtpassword = NOW;
			user.dtpassword = NOW;
		} else
			model.password = undefined;

		if (isoauth) {
			model.otpsecret = undefined;
			model.opt = undefined;
		} else {
			if (!model.otp)
				model.otpsecret = null;
			else if (!model.otpsecret)
				model.otpsecret = undefined;
		}

		var modified = false;

		if (!isoauth && user.email !== model.email) {
			user.email = model.email;
			modified = true;
		} else
			model.email = undefined;

		if (user.status !== model.status)
			user.status = model.status;
		else
			model.status = undefined;

		if (user.notifications !== model.notifications) {
			user.notifications = model.notifications;
			modified = true;
		}

		user.notificationsphone = model.notificationsphone;

		if (user.notificationsemail !== model.notificationsemail) {
			user.notificationsemail = model.notificationsemail;
			modified = true;
		}

		if (!isoauth && user.phone !== model.phone) {
			user.phone = model.phone;
			modified = true;
		} else
			model.phone = undefined;

		user.darkmode = model.darkmode;

		if (user.photo !== model.photo) {
			user.photo = model.photo;
			modified = true;
		}

		if (user.language !== model.language) {
			user.language = model.language;
			modified = true;
		}

		user.sounds = model.sounds;
		user.volume = model.volume;
		user.colorscheme = model.colorscheme || CONF.colorscheme || '#4285f4';
		user.background = model.background;
		user.dtupdated = NOW;
		user.locking = model.locking;
		user.desktop = model.desktop;

		var tmp = model.dateformat || 'yyyy-MM-dd';

		if (user.dateformat !== tmp) {
			user.dateformat = tmp;
			modified = true;
		}

		tmp = model.timeformat || 24;
		if (user.timeformat !== tmp) {
			user.timeformat = model.timeformat;
			modified = true;
		}

		tmp = model.numberformat || 1;

		if (user.numberformat !== tmp) {
			user.numberformat = model.numberformat;
			modified = true;
		}

		var keys = Object.keys(model);

		if (modified) {
			model.dtmodified = user.dtmodified = NOW;
			keys.push('dtmodified');
		}

		if (model.pin && model.pin.length === 4 && model.pin && model.pin != '0000')
			model.pin = user.pin = model.pin.hash(CONF.hashmode || 'sha256', CONF.hashsalt).hash(true) + '';
		else
			model.pin = undefined;

		$.extend && $.extend(model);

		PUBLISH('account-save', FUNC.tms($, model));

		for (var m in model) {
			var val = model[m];
			if (val !== undefined)
				ref[m] = val;
		}

		user.rev = GUID(5);
		MAIN.session.refresh(user.id, $.sessionid);
		EMIT('users/update', user.id, 'account');
		DBMS().log($, model);
		FUNC.save('users');
		$.success();
	});

	schema.addWorkflow('unlock', function($) {

		if (!$.user) {
			$.invalid('error-offline');
			return;
		}

		if ($.user.guest) {
			$.invalid('error-permissions');
			return;
		}

		if (!$.controller.req.locked) {
			$.success();
			return;
		}

		var pin = $.query.pin || '0000';
		var id = $.user.id;

		if (DDOS[id])
			DDOS[id]++;
		else
			DDOS[id] = 1;

		if (DDOS[id] > 4) {
			delete DDOS[id];
			FUNC.logout($.controller);
			return;
		}

		var pin = pin.hash(CONF.hashmode || 'sha256', CONF.hashsalt).hash(true) + '';
		if ($.user.pin !== pin) {
			$.invalid('error-pin');
			return;
		}

		var item = REPO.sessions.findItem('id', $.sessionid);
		if (item) {
			item.locked = false;
			$.user.locked = false;
			$.user.dtlogged2 = NOW;
			delete DDOS[id];
			FUNC.save('sessions');
			$.success();
		} else {
			$.invalid('error-sessions-404');
		}

		DBMS().log($, null, 'Unlock: ' + $.user.name);
	});

	schema.addWorkflow('current', function($) {
		FUNC.profile($.user, function(err, data) {
			data && (data.ip = $.ip);
			data.config = { allowdesktopfluid: CONF.allowdesktopfluid, name: CONF.name, allowstatus: CONF.allowstatus, welcome: CONF.welcome, allowprofile: CONF.allowprofile, allowmembers: CONF.allowmembers, maxmembers: CONF.maxmembers };
			$.user.dtlogged2 = NOW;
			$.user.ping = NOW;
			$.callback(data);
		});
	});

	schema.addWorkflow('live', function($) {
		var running = $.query.running || '';
		if (!($.user.running instanceof Array) || $.user.running.join(',') !== running)
			$.user.running = running.split(',').trim();
		$.user.dtlogged2 = NOW;
		$.user.ping = NOW;
		$.callback(FUNC.profilelive($.user));
	});

});

ON('service', function(counter) {
	if (counter % 60 === 0)
		DDOS = {};
});