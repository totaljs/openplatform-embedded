const DB_NOTIFICATIONS_UNREAD = { unread: false };

NEWSCHEMA('Apps/Notifications', function(schema) {

	schema.define('type', Number);
	schema.define('body', 'String(1000)', true);
	schema.define('data', 'String(1000)');

	schema.setQuery(function($) {

		var db = DBMS();
		db.all('notifications').fields('id,appid,type,title,body,data,ip,dtcreated,unread').where('userid', $.user.id).callback($.callback).take(100).sort('dtcreated', true);

		var user = REPO.users.findItem('id', $.user.id);
		user.countnotifications = 0;
		user.dtnotified = null;

		for (var i = 0; i < REPO.users_apps.length; i++) {
			var item = REPO.users_apps[i];
			if (item.userid === $.user.id)
				item.countnotifications = 0;
		}

		db.mod('notifications', DB_NOTIFICATIONS_UNREAD).where('userid', $.user.id).where('unread', true);

		var user = $.user;
		user.countnotifications = 0;
		var keys = Object.keys(user.apps);
		for (var i = 0; i < keys.length; i++)
			user.apps[keys[i]].countnotifications = 0;

		FUNC.save('users', 'users_apps');
	});

	schema.setSave(function($, model) {
		FUNC.decodetoken($, function(obj) {

			var user = obj.user;
			var app = obj.app;

			if (!app.allownotifications) {
				$.invalid('error-permissions');
				return;
			}

			if (!user.notifications) {
				$.invalid('error-accessible');
				return;
			}

			model.id = UID('notifications');
			model.userid = user.id;
			model.appid = app.id;
			model.dtcreated = new Date();
			model.ip = $.ip;
			model.userappid = user.id + app.id;

			var can = true;
			var ua;

			if (app) {

				if (user.apps[app.id]) {
					ua = user.apps[app.id];

					if (ua.notifications === false) {
						$.invalid('error-notifications-muted');
						return;
					}

					if (ua.countnotifications)
						ua.countnotifications++;
					else
						ua.countnotifications = 1;

					if (ua.countnotifications > 15)
						can = false;
				} else {
					$.invalid('error-accessible');
					return;
				}
			}

			if (user.countnotifications)
				user.countnotifications++;
			else
				user.countnotifications = 1;

			user.dtnotified = NOW;

			if (can) {

				var item = REPO.users.findItem('id', user.id);
				if (item)
					item.countnotifications = user.countnotifications;

				item = REPO.users_apps.findItem('id', user.id + app.id);
				if (item)
					item.countnotifications = ua.countnotifications;

				var db = DBMS();
				db.ins('notifications', model);
				db.callback($.done());

				MAIN.session.update(user.id, function(session) {
					session.apps[app.id].countnotifications = ua.countnotifications;
					session.countnotifications = user.countnotifications;
				});

				FUNC.save('users', 'users_apps');

			} else
				$.success();
		});
	});

	schema.addWorkflow('internal', function($, model) {

		var user = $.user;
		var app = MAIN.apps.findItem('id', $.id);

		if (!app) {
			$.invalid('error-apps-404');
			return;
		}

		if (!app.allownotifications) {
			$.invalid('error-permissions');
			return;
		}

		if (!user.notifications) {
			$.invalid('error-accessible');
			return;
		}

		model.id = UID('notifications');
		model.userid = user.id;
		model.appid = app.id;
		model.dtcreated = NOW;
		model.ip = $.ip;
		model.userappid = user.id + app.id;
		model.unread = true;

		var can = true;
		var ua;

		if (app && user.apps[app.id]) {

			ua = user.apps[app.id];

			if (ua.notifications === false) {
				$.invalid('error-notifications-muted');
				return;
			}

			if (ua.countnotifications)
				ua.countnotifications++;
			else
				ua.countnotifications = 1;

			if (ua.countnotifications > 15)
				can = false;
		}

		if (user.countnotifications)
			user.countnotifications++;
		else
			user.countnotifications = 1;

		user.dtnotified = NOW;

		if (can) {

			var item = REPO.users.findItem('id', user.id);
			if (item)
				item.countnotifications = user.countnotifications;

			item = REPO.users_apps.findItem('id', user.id + app.id);
			if (item)
				item.countnotifications = ua.countnotifications;

			var db = DBMS();
			db.ins('notifications', model);
			db.callback($.done());

			MAIN.session.update(user.id, function(session) {
				session.apps[app.id].countnotifications = ua.countnotifications;
				session.countnotifications = user.countnotifications;
			});

			FUNC.save('users', 'users_apps');

		} else
			$.success();
	});

	schema.addWorkflow('clear', function($) {

		var user = REPO.users.findItem('id', $.user.id);
		user.countnotifications = 0;
		user.dtnotified = null;

		for (var i = 0; i < REPO.users_apps.length; i++) {
			var item = REPO.users_apps[i];
			if (item.userid === $.user.id)
				item.countnotifications = 0;
		}

		DBMS().rem('notifications').where('userid', $.user.id).log($);
		MAIN.session.refresh($.user.id, $.sessionid);
		FUNC.save('users', 'users_apps');

		$.success();
	});

});