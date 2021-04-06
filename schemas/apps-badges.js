NEWSCHEMA('Apps/Badges', function(schema) {

	schema.addWorkflow('exec', function($) {
		FUNC.decodetoken($, function(obj) {

			var user = obj.user;
			var app = obj.app;

			if (app && user.apps[app.id]) {

				var ua = user.apps[app.id];
				if (ua.countbadges)
					ua.countbadges++;
				else
					ua.countbadges = 1;

				var item = REPO.users_apps.findItem('id', user.id + app.id);
				if (item)
					item.countbadges = ua.countbadges;

				MAIN.session.update(user.id, function(session) {
					session.apps[app.id].countbadges = ua.countbadges;
				});

				FUNC.save('users_apps');
			}

			// Response
			$.success();
		});
	});

	schema.addWorkflow('internal', function($) {

		var user = $.user;
		var app = MAIN.apps.findItem('id', $.id);

		if (!app) {
			$.invalid('error-apps-404');
			return;
		}

		if (app && user.apps[app.id]) {

			var ua = user.apps[app.id];
			if (ua.countbadges)
				ua.countbadges++;
			else
				ua.countbadges = 1;

			var item = REPO.users_apps.findItem('id', user.id + app.id);
			if (item)
				item.countbadges = ua.countbadges;

			MAIN.session.update(user.id, function(session) {
				session.apps[app.id].countbadges = ua.countbadges;
			});

			FUNC.save('users_apps');
		}

		// Response
		$.success();

	});

});