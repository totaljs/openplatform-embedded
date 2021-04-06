NEWSCHEMA('Dashboard', function(schema) {

	schema.setRead(async function($) {

		if ($.controller && FUNC.notadmin($))
			return;

		if (TEMP[$.ID]) {
			$.callback(TEMP[$.ID]);
			return;
		}

		var tmp = {};
		var response = await DBMS().find('stats').fields('date').callback($);

		for (var i = 0; i < response.length; i++) {
			var year = response[i].date.getFullYear();
			var key = year + '';
			if (!tmp[key])
				tmp[key] = { year: year };
		}

		var output = [];
		for (var m in tmp)
			output.push(tmp[m]);

		output.quicksort('year', 'asc');
		TEMP[$.ID] = output;
		$.callback(output);
	});

	schema.addWorkflow('online', function($) {

		if ($.controller && FUNC.notadmin($))
			return;

		var date = NOW;
		var db = DBMS();

		db.one('stats').date('date', date);
		db.all('stats_apps').date('date', date).sort('count', true).set('apps');
		db.all('stats_browser').where('date', date).set('browsers').sort('count', true);

		db.callback(function(err, response) {

			response.users = [];

			for (var i = 0; i < REPO.users.length; i++) {
				var item = REPO.users[i];
				if (item.dtlogged)
					response.users.push({ id: item.id, name: item.name, position: item.position, dtlogged: item.dtlogged });
			}

			response.users.quicksort('dtlogged_desc');
			response.users = response.users.take(10);
			response.sessions = { used: 0, free: 0, count: REPO.sessions.length };

			for (var i = 0; i < REPO.sessions.length; i++) {
				var session = REPO.sessions[i];
				if (session.online)
					response.sessions.used++;
				else
					response.sessions.free++;
			}

			response.version = MAIN.version;
			response.memory = process.memoryUsage();
			response.performance = F.stats.performance;
			response.embbedded = MAIN.embbedded === true;
			$.callback(response);
		});

	});

	schema.addWorkflow('total', function($) {

		if ($.controller && FUNC.notadmin($))
			return;

		var db = DBMS();
		db.scalar('stats', 'sum', 'logged').set('visitors');
		db.scalar('stats', 'max', 'maxonline').set('maxonline');
		db.callback($.callback);
	});

	schema.addWorkflow('yearly', async function($) {

		if ($.controller && FUNC.notadmin($))
			return;

		if (TEMP[$.ID]) {
			$.callback(TEMP[$.ID]);
			return;
		}

		var response = {};

		response.usage = [];
		response.apps = [];
		response.browsers = [];

		var year = ($.id ? +$.id : NOW.getFullYear());
		var data = await DBMS().find('stats').year('date', year).callback($);
		var tmp = {};

		for (var i = 0; i < data.length; i++) {
			var item = data[i];
			var key = +item.date.format('M');

			if (!item.logged)
				item.logged = 0;

			if (item.mobile);
				item.mobile = 0;

			if (!item.desktop)
				item.desktop = 0;

			if (!item.maxonline)
				item.maxonline = 0;

			if (!item.windowed)
				item.windowed = 0;

			if (!item.portal)
				item.portal = 0;

			if (!item.tabbed)
				item.tabbed = 0;

			if (!item.lightmode)
				item.lightmode = 0;

			if (!item.darkmode)
				item.darkmode = 0;

			if (tmp[key]) {
				tmp[key][0] += item.logged;
				tmp[key][1] += item.mobile;
				tmp[key][2] += item.desktop;

				if (tmp[key][3] < item.maxonline)
					tmp[key][3] = item.maxonline;

				tmp[key][4] += item.windowed;
				tmp[key][5] += item.portal;
				tmp[key][6] += item.tabbed;
				tmp[key][7] += item.lightmode;
				tmp[key][8] += item.darkmode;
			} else
				tmp[key] = [item.logged, item.mobile, item.desktop, item.maxonline, item.windowed, item.portal, item.tabbed, item.lightmode, item.darkmode];
		}

		for (var m in tmp)
			response.usage.push({ month: +m, stats: tmp[m] });

		var db = DBMS();
		var apps = await db.query('stats_apps', 'if(arg[doc.appid]){arg[doc.appid]+=doc.count}else{arg[doc.appid]=doc.count}').year('date', year).callback($);
		var browsers = await db.query('stats_browser', 'if(arg[doc.name]){arg[doc.name]+=doc.count}else{arg[doc.name]=doc.count}').year('date', year).callback($);

		response.apps = [];
		response.browsers = [];

		for (var m in apps)
			response.apps.push({ appid: m, count: apps[m] });

		for (var m in browsers)
			response.browsers.push({ name: m, count: browsers[m] });

		response.browsers.quicksort('count_desc');
		response.apps.quicksort('count_desc');
		response.apps = response.apps.take(15);
		response.browsers = response.browsers.take(15);

		TEMP[$.ID] = response;
		$.callback(response);
	});

});